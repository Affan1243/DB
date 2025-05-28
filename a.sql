
CREATE DATABASE IF NOT EXISTS student_tracker_db;
USE student_tracker_db;

-- 1. Users Table (for authentication/roles)
CREATE TABLE IF NOT EXISTS users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL, -- Store hashed passwords
    role ENUM('admin', 'teacher', 'student') NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Teachers Table
CREATE TABLE IF NOT EXISTS teachers (
    teacher_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNIQUE, -- Link to users table
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE,
    phone_number VARCHAR(20),
    hire_date DATE,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- 3. Students Table
CREATE TABLE IF NOT EXISTS students (
    student_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNIQUE, -- Link to users table (optional, if students have logins)
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    student_unique_id VARCHAR(50) NOT NULL UNIQUE, -- e.g., university ID
    email VARCHAR(100) UNIQUE,
    date_of_birth DATE,
    enrollment_date DATE,
    total_present_days INT DEFAULT 0, -- Added for trigger
    total_absent_days INT DEFAULT 0,  -- Added for trigger
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL
);

-- 4. Courses Table
CREATE TABLE IF NOT EXISTS courses (
    course_id INT AUTO_INCREMENT PRIMARY KEY,
    course_code VARCHAR(20) NOT NULL UNIQUE,
    course_name VARCHAR(255) NOT NULL,
    description TEXT,
    teacher_id INT,
    start_date DATE,
    end_date DATE,
    FOREIGN KEY (teacher_id) REFERENCES teachers(teacher_id) ON DELETE SET NULL
);

-- 5. Enrollments Table (Student-Course relationship)
CREATE TABLE IF NOT EXISTS enrollments (
    enrollment_id INT AUTO_INCREMENT PRIMARY KEY,
    student_id INT NOT NULL,
    course_id INT NOT NULL,
    enrollment_date DATE DEFAULT CURRENT_DATE,
    grade_status VARCHAR(50), -- e.g., 'In Progress', 'Completed', 'Withdrawn'
    FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE,
    FOREIGN KEY (course_id) REFERENCES courses(course_id) ON DELETE CASCADE,
    UNIQUE (student_id, course_id) -- A student can only enroll in a course once
);

-- 6. Attendance Sessions Table (Represents a specific class/lecture)
CREATE TABLE IF NOT EXISTS attendance_sessions (
    session_id INT AUTO_INCREMENT PRIMARY KEY,
    course_id INT NOT NULL,
    session_date DATE NOT NULL,
    session_time TIME,
    topic VARCHAR(255),
    FOREIGN KEY (course_id) REFERENCES courses(course_id) ON DELETE CASCADE
);

-- 7. Attendance Records Table (Individual student attendance for a session)
CREATE TABLE IF NOT EXISTS attendance_records (
    record_id INT AUTO_INCREMENT PRIMARY KEY,
    enrollment_id INT NOT NULL,
    session_id INT NOT NULL,
    status ENUM('Present', 'Absent', 'Late', 'Excused') NOT NULL,
    notes TEXT,
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (enrollment_id) REFERENCES enrollments(enrollment_id) ON DELETE CASCADE,
    FOREIGN KEY (session_id) REFERENCES attendance_sessions(session_id) ON DELETE CASCADE,
    UNIQUE (enrollment_id, session_id) -- A student can only have one record per session
);

-- 8. Assignments Table
CREATE TABLE IF NOT EXISTS assignments (
    assignment_id INT AUTO_INCREMENT PRIMARY KEY,
    course_id INT NOT NULL,
    assignment_name VARCHAR(255) NOT NULL,
    description TEXT,
    due_date DATETIME NOT NULL,
    max_score DECIMAL(5, 2),
    FOREIGN KEY (course_id) REFERENCES courses(course_id) ON DELETE CASCADE
);

-- 9. Submissions Table (Student submissions for assignments)
CREATE TABLE IF NOT EXISTS submissions (
    submission_id INT AUTO_INCREMENT PRIMARY KEY,
    assignment_id INT NOT NULL,
    student_id INT NOT NULL,
    submission_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    score DECIMAL(5, 2),
    feedback TEXT,
    FOREIGN KEY (assignment_id) REFERENCES assignments(assignment_id) ON DELETE CASCADE,
    FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE,
    UNIQUE (assignment_id, student_id) -- A student can only submit an assignment once
);


-- Trigger: update_student_attendance_summary
-- This trigger updates the total_present_days or total_absent_days in the students table
-- whenever a new attendance record is inserted.
DELIMITER //
CREATE TRIGGER update_student_attendance_summary
AFTER INSERT ON attendance_records
FOR EACH ROW
BEGIN
    DECLARE student_id_val INT;

    -- Get the student_id from the enrollment_id
    SELECT student_id INTO student_id_val
    FROM enrollments
    WHERE enrollment_id = NEW.enrollment_id;

    IF NEW.status = 'Present' THEN
        UPDATE students
        SET total_present_days = total_present_days + 1
        WHERE student_id = student_id_val;
    ELSEIF NEW.status = 'Absent' THEN
        UPDATE students
        SET total_absent_days = total_absent_days + 1
        WHERE student_id = student_id_val;
    END IF;
END;
//
DELIMITER ;

-- Stored Procedure: GetStudentCourseSummary
-- This procedure retrieves a summary of a student's courses, including attendance and assignment scores.
DELIMITER //
CREATE PROCEDURE GetStudentCourseSummary(IN p_student_id INT)
BEGIN
    SELECT
        s.first_name,
        s.last_name,
        c.course_name,
        c.course_code,
        t.first_name AS teacher_first_name,
        t.last_name AS teacher_last_name,
        e.enrollment_date,
        e.grade_status,
        (SELECT COUNT(*) FROM attendance_records ar
         JOIN attendance_sessions ass ON ar.session_id = ass.session_id
         JOIN enrollments enr ON ar.enrollment_id = enr.enrollment_id
         WHERE enr.student_id = s.student_id AND ass.course_id = c.course_id AND ar.status = 'Present') AS total_present_in_course,
        (SELECT COUNT(*) FROM attendance_records ar
         JOIN attendance_sessions ass ON ar.session_id = ass.session_id
         JOIN enrollments enr ON ar.enrollment_id = enr.enrollment_id
         WHERE enr.student_id = s.student_id AND ass.course_id = c.course_id AND ar.status = 'Absent') AS total_absent_in_course,
        GROUP_CONCAT(DISTINCT CONCAT(a.assignment_name, ' (Score: ', COALESCE(sub.score, 'N/A'), '/', a.max_score, ')') ORDER BY a.due_date SEPARATOR '; ') AS assignment_scores
    FROM
        students s
    JOIN
        enrollments e ON s.student_id = e.student_id
    JOIN
        courses c ON e.course_id = c.course_id
    LEFT JOIN
        teachers t ON c.teacher_id = t.teacher_id
    LEFT JOIN
        assignments a ON c.course_id = a.course_id
    LEFT JOIN
        submissions sub ON a.assignment_id = sub.assignment_id AND s.student_id = sub.student_id
    WHERE
        s.student_id = p_student_id
    GROUP BY
        s.student_id, c.course_id
    ORDER BY
        c.course_name;
END;
//
DELIMITER ;