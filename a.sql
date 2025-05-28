CREATE DATABASE IF NOT EXISTS student_tracker_db;
USE student_tracker_db;

CREATE TABLE IF NOT EXISTS users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('admin', 'teacher', 'student') NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS teachers (
    teacher_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNIQUE,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE,
    phone_number VARCHAR(20),
    hire_date DATE,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS students (
    student_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNIQUE,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    student_unique_id VARCHAR(50) NOT NULL UNIQUE, 
    email VARCHAR(100) UNIQUE,
    date_of_birth DATE,
    enrollment_date DATE,
    total_present_days INT DEFAULT 0, 
    total_absent_days INT DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL
);

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

CREATE TABLE IF NOT EXISTS enrollments (
    enrollment_id INT AUTO_INCREMENT PRIMARY KEY,
    student_id INT NOT NULL,
    course_id INT NOT NULL,
    enrollment_date DATE,
    grade_status VARCHAR(50),
    FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE,
    FOREIGN KEY (course_id) REFERENCES courses(course_id) ON DELETE CASCADE,
    UNIQUE (student_id, course_id)
);

CREATE TABLE IF NOT EXISTS attendance_sessions (
    session_id INT AUTO_INCREMENT PRIMARY KEY,
    course_id INT NOT NULL,
    session_date DATE NOT NULL,
    session_time TIME,
    topic VARCHAR(255),
    FOREIGN KEY (course_id) REFERENCES courses(course_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS attendance_records (
    record_id INT AUTO_INCREMENT PRIMARY KEY,
    enrollment_id INT NOT NULL,
    session_id INT NOT NULL,
    status ENUM('Present', 'Absent', 'Late', 'Excused') NOT NULL,
    notes TEXT,
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (enrollment_id) REFERENCES enrollments(enrollment_id) ON DELETE CASCADE,
    FOREIGN KEY (session_id) REFERENCES attendance_sessions(session_id) ON DELETE CASCADE,
    UNIQUE (enrollment_id, session_id)
);

CREATE TABLE IF NOT EXISTS assignments (
    assignment_id INT AUTO_INCREMENT PRIMARY KEY,
    course_id INT NOT NULL,
    assignment_name VARCHAR(255) NOT NULL,
    description TEXT,
    due_date DATETIME NOT NULL,
    max_score DECIMAL(5, 2),
    FOREIGN KEY (course_id) REFERENCES courses(course_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS submissions (
    submission_id INT AUTO_INCREMENT PRIMARY KEY,
    assignment_id INT NOT NULL,
    student_id INT NOT NULL,
    submission_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    score DECIMAL(5, 2),
    feedback TEXT,
    FOREIGN KEY (assignment_id) REFERENCES assignments(assignment_id) ON DELETE CASCADE,
    FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE,
    UNIQUE (assignment_id, student_id) 
);

DELIMITER //
CREATE TRIGGER update_student_attendance_summary
AFTER INSERT ON attendance_records
FOR EACH ROW
BEGIN
    DECLARE student_id_val INT;

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

DELIMITER //  -- Switching the delimiter to '//' so we can define a multi-line procedure without confusing MySQL
CREATE PROCEDURE GetStudentCourseSummary(IN p_student_id INT)  -- Defining a stored procedure named 'GetStudentCourseSummary' with one input parameter: the student ID
BEGIN
    SELECT
        s.first_name,  -- Student’s first name
        s.last_name,   -- Student’s last name
        c.course_name, -- Name of the course the student is enrolled in
        c.course_code, -- Course code (e.g., CS101, MATH202)
        t.first_name AS teacher_first_name,  -- First name of the course's teacher
        t.last_name AS teacher_last_name,    -- Last name of the course's teacher
        e.enrollment_date,   -- Date when the student enrolled in the course
        e.grade_status,      -- Current grade status for this course (e.g., "Pass", "Fail", "In Progress")

        -- Subquery to count how many times the student was marked 'Present' in this course
        (SELECT COUNT(*) FROM attendance_records ar
         JOIN attendance_sessions ass ON ar.session_id = ass.session_id
         JOIN enrollments enr ON ar.enrollment_id = enr.enrollment_id
         WHERE enr.student_id = s.student_id AND ass.course_id = c.course_id AND ar.status = 'Present') AS total_present_in_course,

        -- Subquery to count how many times the student was marked 'Absent' in this course
        (SELECT COUNT(*) FROM attendance_records ar
         JOIN attendance_sessions ass ON ar.session_id = ass.session_id
         JOIN enrollments enr ON ar.enrollment_id = enr.enrollment_id
         WHERE enr.student_id = s.student_id AND ass.course_id = c.course_id AND ar.status = 'Absent') AS total_absent_in_course,

        -- Concatenate all assignment names with their scores (or 'N/A' if not submitted) and max score, separated by semicolons
        GROUP_CONCAT(
            DISTINCT CONCAT(
                a.assignment_name, 
                ' (Score: ', 
                COALESCE(sub.score, 'N/A'), 
                '/', 
                a.max_score, 
                ')'
            ) 
            ORDER BY a.due_date SEPARATOR '; '
        ) AS assignment_scores

    FROM
        students s  -- Starting from the students table
    JOIN
        enrollments e ON s.student_id = e.student_id  -- Joining enrollments to find which courses the student is in
    JOIN
        courses c ON e.course_id = c.course_id  -- Joining courses to get course info
    LEFT JOIN
        teachers t ON c.teacher_id = t.teacher_id  -- Joining teachers (if any assigned) to the course
    LEFT JOIN
        assignments a ON c.course_id = a.course_id  -- Joining assignments related to the course
    LEFT JOIN
        submissions sub ON a.assignment_id = sub.assignment_id AND s.student_id = sub.student_id  -- Joining submissions to get the student's scores

    WHERE
        s.student_id = p_student_id  -- Only fetch data for the specified student ID

    GROUP BY
        s.student_id, c.course_id  -- Grouping results by student and course, since we’re combining multiple rows

    ORDER BY
        c.course_name;  -- Sort the output by course name alphabetically
END;
//  -- End of the stored procedure body
DELIMITER ;  -- Switch back to the default semicolon delimiter
