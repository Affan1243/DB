// server.js
// This Node.js server connects the HTML/CSS frontend to the MySQL database.
// It uses Express for routing and EJS as a templating engine to render dynamic HTML.

// Import necessary modules
const express = require('express'); // Web framework for Node.js
const mysql = require('mysql');     // MySQL client for Node.js
const path = require('path');       // Utility for working with file and directory paths

// Create an Express application instance
const app = express();
const port = 3000; // Define the port for the server to listen on

// MySQL Database Configuration
// IMPORTANT: Replace these with your actual MySQL credentials
const dbConfig = {
    host: 'localhost', // Your MySQL host (e.g., 'localhost' or IP address)
    user: 'root',      // Your MySQL username
    password: '1243', // Your MySQL password
    database: 'student_tracker_db' // The database we created earlier
};

// Create a MySQL connection pool.
// A pool manages multiple connections, improving performance for concurrent requests.
const pool = mysql.createPool(dbConfig);

// Middleware Setup

// Serve static files from the 'public' directory (e.g., style.css)
// When a request comes in for a file that doesn't match a route, Express will look in 'public'.
app.use(express.static(path.join(__dirname, 'public')));

// Set EJS as the templating engine
// This tells Express to look for view files (HTML with EJS tags) in the 'views' directory.
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Parse URL-encoded bodies (as sent by HTML forms)
// This middleware populates `req.body` with the form data.
app.use(express.urlencoded({ extended: true }));

// Parse JSON bodies (if you were to send JSON from a client, though not strictly needed for this HTML-only setup)
app.use(express.json());

// --- Routes ---

// Root Route: Dashboard
app.get('/', async (req, res) => {
    try {
        // You could fetch some dashboard summary data here if needed
        // For now, just render the index.html (which is now index.ejs)
        res.render('index');
    } catch (err) {
        console.error('Error rendering dashboard:', err);
        res.status(500).send('Server Error');
    }
});

// Students Routes

// GET /students: Display a list of all students and the form to add a new student
app.get('/students', async (req, res) => {
    pool.getConnection((err, connection) => {
        if (err) {
            console.error('Error getting MySQL connection:', err);
            return res.status(500).send('Database connection error');
        }
        const query = 'SELECT * FROM students ORDER BY last_name, first_name';
        connection.query(query, (error, results) => {
            connection.release(); // Release the connection back to the pool
            if (error) {
                console.error('Error fetching students:', error);
                return res.status(500).send('Error retrieving students');
            }
            // Render the students.ejs template, passing the fetched students data
            res.render('students', { students: results });
        });
    });
});

// POST /students: Handle adding a new student
app.post('/students', async (req, res) => {
    const { firstName, lastName, studentUniqueId, email, dob, enrollmentDate } = req.body;

    // Basic validation
    if (!firstName || !lastName || !studentUniqueId) {
        return res.status(400).send('First Name, Last Name, and Student ID are required.');
    }

    pool.getConnection((err, connection) => {
        if (err) {
            console.error('Error getting MySQL connection:', err);
            return res.status(500).send('Database connection error');
        }

        const query = `INSERT INTO students (first_name, last_name, student_unique_id, email, date_of_birth, enrollment_date) VALUES (?, ?, ?, ?, ?, ?)`;
        const values = [firstName, lastName, studentUniqueId, email || null, dob || null, enrollmentDate || null];

        connection.query(query, values, (error, results) => {
            connection.release();
            if (error) {
                console.error('Error adding student:', error);
                // Handle duplicate student_unique_id error gracefully
                if (error.code === 'ER_DUP_ENTRY') {
                    return res.status(409).send('Error: Student ID already exists. Please use a unique ID.');
                }
                return res.status(500).send('Error adding student');
            }
            // Redirect back to the students page to see the updated list
            res.redirect('/students');
        });
    });
});

// Attendance Routes

// GET /attendance: Display attendance sessions and forms
app.get('/attendance', async (req, res) => {
    pool.getConnection((err, connection) => {
        if (err) {
            console.error('Error getting MySQL connection:', err);
            return res.status(500).send('Database connection error');
        }

        // Fetch courses for the dropdown
        connection.query('SELECT course_id, course_code, course_name FROM courses', (errorCourses, courses) => {
            if (errorCourses) {
                connection.release();
                console.error('Error fetching courses for attendance:', errorCourses);
                return res.status(500).send('Error retrieving courses');
            }

            // Fetch recent attendance sessions
            const sessionQuery = `
                SELECT
                    ats.session_id,
                    ats.session_date,
                    ats.session_time,
                    ats.topic,
                    c.course_name,
                    c.course_code
                FROM
                    attendance_sessions ats
                JOIN
                    courses c ON ats.course_id = c.course_id
                ORDER BY
                    ats.session_date DESC, ats.session_time DESC
                LIMIT 10;
            `;
            connection.query(sessionQuery, (errorSessions, sessions) => {
                connection.release();
                if (errorSessions) {
                    console.error('Error fetching attendance sessions:', errorSessions);
                    return res.status(500).send('Error retrieving attendance sessions');
                }
                res.render('attendance', { courses: courses, sessions: sessions, selectedSession: null, enrollments: null });
            });
        });
    });
});

// POST /attendance/record: Create a new attendance session
app.post('/attendance/record', async (req, res) => {
    const { courseId, sessionDate, sessionTime, topic } = req.body;

    if (!courseId || !sessionDate) {
        return res.status(400).send('Course and Session Date are required.');
    }

    pool.getConnection((err, connection) => {
        if (err) {
            console.error('Error getting MySQL connection:', err);
            return res.status(500).send('Database connection error');
        }

        const query = `INSERT INTO attendance_sessions (course_id, session_date, session_time, topic) VALUES (?, ?, ?, ?)`;
        const values = [courseId, sessionDate, sessionTime || null, topic || null];

        connection.query(query, values, (error, results) => {
            connection.release();
            if (error) {
                console.error('Error creating attendance session:', error);
                return res.status(500).send('Error creating attendance session');
            }
            res.redirect('/attendance'); // Redirect back to attendance page
        });
    });
});

// GET /attendance/mark: Display form to mark attendance for a specific session
app.get('/attendance/mark', async (req, res) => {
    const sessionId = req.query.sessionId;

    if (!sessionId) {
        return res.redirect('/attendance'); // Redirect if no session ID is provided
    }

    pool.getConnection((err, connection) => {
        if (err) {
            console.error('Error getting MySQL connection:', err);
            return res.status(500).send('Database connection error');
        }

        // Fetch selected session details
        const sessionQuery = `
            SELECT
                ats.session_id,
                ats.session_date,
                ats.session_time,
                ats.topic,
                c.course_id,
                c.course_name,
                c.course_code
            FROM
                attendance_sessions ats
            JOIN
                courses c ON ats.course_id = c.course_id
            WHERE
                ats.session_id = ?;
        `;

        connection.query(sessionQuery, [sessionId], (errorSession, selectedSession) => {
            if (errorSession) {
                connection.release();
                console.error('Error fetching selected session:', errorSession);
                return res.status(500).send('Error retrieving session details');
            }
            if (selectedSession.length === 0) {
                connection.release();
                return res.status(404).send('Session not found.');
            }

            const courseId = selectedSession[0].course_id;

            // Fetch students enrolled in this course and their existing attendance status for this session
            const enrollmentsQuery = `
                SELECT
                    e.enrollment_id,
                    s.student_id,
                    s.first_name,
                    s.last_name,
                    ar.status,
                    ar.notes
                FROM
                    enrollments e
                JOIN
                    students s ON e.student_id = s.student_id
                LEFT JOIN
                    attendance_records ar ON e.enrollment_id = ar.enrollment_id AND ar.session_id = ?
                WHERE
                    e.course_id = ?
                ORDER BY
                    s.last_name, s.first_name;
            `;

            connection.query(enrollmentsQuery, [sessionId, courseId], (errorEnrollments, enrollments) => {
                connection.release();
                if (errorEnrollments) {
                    console.error('Error fetching enrollments for attendance:', errorEnrollments);
                    return res.status(500).send('Error retrieving enrollments');
                }

                // Fetch courses and sessions again to populate the full attendance page
                connection.query('SELECT course_id, course_code, course_name FROM courses', (errorCourses, courses) => {
                    if (errorCourses) {
                        console.error('Error fetching courses for attendance:', errorCourses);
                        return res.status(500).send('Error retrieving courses');
                    }
                    const sessionQueryAll = `
                        SELECT
                            ats.session_id,
                            ats.session_date,
                            ats.session_time,
                            ats.topic,
                            c.course_name,
                            c.course_code
                        FROM
                            attendance_sessions ats
                        JOIN
                            courses c ON ats.course_id = c.course_id
                        ORDER BY
                            ats.session_date DESC, ats.session_time DESC
                        LIMIT 10;
                    `;
                    connection.query(sessionQueryAll, (errorSessions, sessions) => {
                        if (errorSessions) {
                            console.error('Error fetching all attendance sessions:', errorSessions);
                            return res.status(500).send('Error retrieving all attendance sessions');
                        }
                        res.render('attendance', {
                            courses: courses,
                            sessions: sessions,
                            selectedSession: selectedSession[0],
                            enrollments: enrollments
                        });
                    });
                });
            });
        });
    });
});

// POST /attendance/submit: Submit attendance records for a session
app.post('/attendance/submit', (req, res) => {
    const { sessionId, enrollmentIds } = req.body;

    if (!sessionId || !enrollmentIds || !Array.isArray(enrollmentIds)) {
        return res.status(400).send('Invalid attendance data provided.');
    }

    pool.getConnection((err, connection) => {
        if (err) {
            console.error('Error getting MySQL connection:', err);
            return res.status(500).send('Database connection error');
        }

        connection.beginTransaction(err => {
            if (err) {
                connection.release();
                console.error('Error starting transaction:', err);
                return res.status(500).send('Transaction error');
            }

            let tasksDone = 0;
            let hasError = false;

            enrollmentIds.forEach(enrollmentId => {
                const status = req.body[`status_${enrollmentId}`];
                const notes = req.body[`notes_${enrollmentId}`];

                if (!status) {
                    hasError = true;
                    connection.rollback(() => {
                        connection.release();
                        res.status(400).send(`Status missing for enrollment ID: ${enrollmentId}`);
                    });
                    return;
                }

                const checkQuery = `SELECT record_id FROM attendance_records WHERE enrollment_id = ? AND session_id = ?`;
                connection.query(checkQuery, [enrollmentId, sessionId], (err, results) => {
                    if (hasError) return;
                    if (err) {
                        hasError = true;
                        connection.rollback(() => {
                            connection.release();
                            console.error('Error checking attendance record:', err);
                            res.status(500).send('Error checking attendance record');
                        });
                        return;
                    }

                    if (results.length > 0) {
                        const updateQuery = `UPDATE attendance_records SET status = ?, notes = ? WHERE record_id = ?`;
                        connection.query(updateQuery, [status, notes || null, results[0].record_id], handleQueryFinish);
                    } else {
                        const insertQuery = `INSERT INTO attendance_records (enrollment_id, session_id, status, notes) VALUES (?, ?, ?, ?)`;
                        connection.query(insertQuery, [enrollmentId, sessionId, status, notes || null], handleQueryFinish);
                    }
                });
            });

            function handleQueryFinish(err) {
                if (hasError) return;
                if (err) {
                    hasError = true;
                    connection.rollback(() => {
                        connection.release();
                        console.error('Error modifying attendance:', err);
                        res.status(500).send('Error submitting attendance');
                    });
                    return;
                }

                tasksDone++;
                if (tasksDone === enrollmentIds.length) {
                    connection.commit(err => {
                        if (err) {
                            connection.rollback(() => {
                                connection.release();
                                console.error('Error committing attendance transaction:', err);
                                res.status(500).send('Error finalizing attendance');
                            });
                        } else {
                            connection.release();
                            res.redirect(`/attendance/mark?sessionId=${sessionId}`);
                        }
                    });
                }
            }
        });
    });
});


// Assignments Routes

// GET /assignments: Display all assignments and the form to add a new assignment
app.get('/assignments', async (req, res) => {
    pool.getConnection((err, connection) => {
        if (err) {
            console.error('Error getting MySQL connection:', err);
            return res.status(500).send('Database connection error');
        }

        // Fetch courses for the dropdown
        connection.query('SELECT course_id, course_code, course_name FROM courses', (errorCourses, courses) => {
            if (errorCourses) {
                connection.release();
                console.error('Error fetching courses for assignments:', errorCourses);
                return res.status(500).send('Error retrieving courses');
            }

            // Fetch all assignments with course details
            const assignmentQuery = `
                SELECT
                    a.assignment_id,
                    a.assignment_name,
                    a.description,
                    a.due_date,
                    a.max_score,
                    c.course_code,
                    c.course_name
                FROM
                    assignments a
                JOIN
                    courses c ON a.course_id = c.course_id
                ORDER BY
                    a.due_date DESC;
            `;
            connection.query(assignmentQuery, (errorAssignments, assignments) => {
                connection.release();
                if (errorAssignments) {
                    console.error('Error fetching assignments:', errorAssignments);
                    return res.status(500).send('Error retrieving assignments');
                }
                res.render('assignments', {
                    courses: courses,
                    assignments: assignments,
                    selectedAssignment: null,
                    enrollmentsForAssignment: null
                });
            });
        });
    });
});

// POST /assignments: Handle adding a new assignment
app.post('/assignments', async (req, res) => {
    const { courseId, assignmentName, description, dueDate, maxScore } = req.body;

    if (!courseId || !assignmentName || !dueDate) {
        return res.status(400).send('Course, Assignment Name, and Due Date are required.');
    }

    pool.getConnection((err, connection) => {
        if (err) {
            console.error('Error getting MySQL connection:', err);
            return res.status(500).send('Database connection error');
        }

        const query = `INSERT INTO assignments (course_id, assignment_name, description, due_date, max_score) VALUES (?, ?, ?, ?, ?)`;
        const values = [courseId, assignmentName, description || null, dueDate, maxScore || null];

        connection.query(query, values, (error, results) => {
            connection.release();
            if (error) {
                console.error('Error adding assignment:', error);
                return res.status(500).send('Error adding assignment');
            }
            res.redirect('/assignments');
        });
    });
});

// GET /assignments/submit-score: Display form to submit scores for a specific assignment
app.get('/assignments/submit-score', async (req, res) => {
    const assignmentId = req.query.assignmentId;

    if (!assignmentId) {
        return res.redirect('/assignments');
    }

    pool.getConnection((err, connection) => {
        if (err) {
            console.error('Error getting MySQL connection:', err);
            return res.status(500).send('Database connection error');
        }

        // Fetch selected assignment details
        const assignmentQuery = `
            SELECT
                a.assignment_id,
                a.assignment_name,
                a.description,
                a.due_date,
                a.max_score,
                c.course_id,
                c.course_name,
                c.course_code
            FROM
                assignments a
            JOIN
                courses c ON a.course_id = c.course_id
            WHERE
                a.assignment_id = ?;
        `;

        connection.query(assignmentQuery, [assignmentId], (errorAssignment, selectedAssignment) => {
            if (errorAssignment) {
                connection.release();
                console.error('Error fetching selected assignment:', errorAssignment);
                return res.status(500).send('Error retrieving assignment details');
            }
            if (selectedAssignment.length === 0) {
                connection.release();
                return res.status(404).send('Assignment not found.');
            }

            const courseId = selectedAssignment[0].course_id;

            // Fetch students enrolled in this course and their existing submission for this assignment
            const enrollmentsQuery = `
                SELECT
                    s.student_id,
                    s.first_name,
                    s.last_name,
                    sub.score,
                    sub.feedback
                FROM
                    enrollments e
                JOIN
                    students s ON e.student_id = s.student_id
                LEFT JOIN
                    submissions sub ON s.student_id = sub.student_id AND sub.assignment_id = ?
                WHERE
                    e.course_id = ?
                ORDER BY
                    s.last_name, s.first_name;
            `;

            connection.query(enrollmentsQuery, [assignmentId, courseId], (errorEnrollments, enrollmentsForAssignment) => {
                connection.release();
                if (errorEnrollments) {
                    console.error('Error fetching enrollments for assignment scores:', errorEnrollments);
                    return res.status(500).send('Error retrieving enrollments');
                }

                // Fetch courses and assignments again to populate the full assignments page
                connection.query('SELECT course_id, course_code, course_name FROM courses', (errorCourses, courses) => {
                    if (errorCourses) {
                        console.error('Error fetching courses for assignments:', errorCourses);
                        return res.status(500).send('Error retrieving courses');
                    }
                    const assignmentQueryAll = `
                        SELECT
                            a.assignment_id,
                            a.assignment_name,
                            a.description,
                            a.due_date,
                            a.max_score,
                            c.course_code,
                            c.course_name
                        FROM
                            assignments a
                        JOIN
                            courses c ON a.course_id = c.course_id
                        ORDER BY
                            a.due_date DESC;
                    `;
                    connection.query(assignmentQueryAll, (errorAssignments, assignments) => {
                        if (errorAssignments) {
                            console.error('Error fetching all assignments:', errorAssignments);
                            return res.status(500).send('Error retrieving all assignments');
                        }
                        res.render('assignments', {
                            courses: courses,
                            assignments: assignments,
                            selectedAssignment: selectedAssignment[0],
                            enrollmentsForAssignment: enrollmentsForAssignment
                        });
                    });
                });
            });
        });
    });
});

app.post('/assignments/submit-scores', (req, res) => {
    const { assignmentId, studentIds } = req.body;

    if (!assignmentId || !studentIds || !Array.isArray(studentIds)) {
        return res.status(400).send('Invalid submission data provided.');
    }

    pool.getConnection((err, connection) => {
        if (err) {
            console.error('Error getting MySQL connection:', err);
            return res.status(500).send('Database connection error');
        }

        connection.beginTransaction(err => {
            if (err) {
                connection.release();
                console.error('Transaction start error:', err);
                return res.status(500).send('Transaction error');
            }

            let completed = 0;
            let failed = false;

            studentIds.forEach(studentId => {
                const score = req.body[`score_${studentId}`];
                const feedback = req.body[`feedback_${studentId}`];

                const checkQuery = `SELECT submission_id FROM submissions WHERE assignment_id = ? AND student_id = ?`;
                connection.query(checkQuery, [assignmentId, studentId], (err, results) => {
                    if (failed) return;
                    if (err) {
                        failed = true;
                        connection.rollback(() => {
                            connection.release();
                            console.error('Error checking submission:', err);
                            res.status(500).send('Error checking submission');
                        });
                        return;
                    }

                    if (results.length > 0) {
                        const updateQuery = `UPDATE submissions SET score = ?, feedback = ?, submission_date = NOW() WHERE submission_id = ?`;
                        connection.query(updateQuery, [score || null, feedback || null, results[0].submission_id], handleFinish);
                    } else {
                        const insertQuery = `INSERT INTO submissions (assignment_id, student_id, score, feedback) VALUES (?, ?, ?, ?)`;
                        connection.query(insertQuery, [assignmentId, studentId, score || null, feedback || null], handleFinish);
                    }
                });
            });

            function handleFinish(err) {
                if (failed) return;
                if (err) {
                    failed = true;
                    connection.rollback(() => {
                        connection.release();
                        console.error('Error saving score:', err);
                        res.status(500).send('Error submitting scores');
                    });
                    return;
                }

                completed++;
                if (completed === studentIds.length) {
                    connection.commit(err => {
                        if (err) {
                            connection.rollback(() => {
                                connection.release();
                                console.error('Commit error:', err);
                                res.status(500).send('Error finalizing score submission');
                            });
                        } else {
                            connection.release();
                            res.redirect(`/assignments/submit-score?assignmentId=${assignmentId}`);
                        }
                    });
                }
            }
        });
    });
});


// Courses Routes

// GET /courses: Display all courses and forms to add/enroll
app.get('/courses', async (req, res) => {
    pool.getConnection((err, connection) => {
        if (err) {
            console.error('Error getting MySQL connection:', err);
            return res.status(500).send('Database connection error');
        }

        // Fetch teachers for the dropdown
        connection.query('SELECT teacher_id, first_name, last_name FROM teachers', (errorTeachers, teachers) => {
            if (errorTeachers) {
                connection.release();
                console.error('Error fetching teachers for courses:', errorTeachers);
                return res.status(500).send('Error retrieving teachers');
            }

            // Fetch all courses with teacher names
            const courseQuery = `
                SELECT
                    c.course_id,
                    c.course_code,
                    c.course_name,
                    c.description,
                    c.start_date,
                    c.end_date,
                    t.first_name AS teacher_first_name,
                    t.last_name AS teacher_last_name
                FROM
                    courses c
                LEFT JOIN
                    teachers t ON c.teacher_id = t.teacher_id
                ORDER BY
                    c.course_name;
            `;
            connection.query(courseQuery, (errorCourses, courses) => {
                connection.release();
                if (errorCourses) {
                    console.error('Error fetching courses:', errorCourses);
                    return res.status(500).send('Error retrieving courses');
                }
                res.render('courses', {
                    teachers: teachers,
                    courses: courses,
                    selectedCourse: null,
                    students: [], // Will be populated when selecting a course to enroll
                    enrolledStudents: [] // Will be populated when selecting a course to enroll
                });
            });
        });
    });
});

// POST /courses: Handle adding a new course
app.post('/courses', async (req, res) => {
    const { courseCode, courseName, description, teacherId, startDate, endDate } = req.body;

    if (!courseCode || !courseName) {
        return res.status(400).send('Course Code and Course Name are required.');
    }

    pool.getConnection((err, connection) => {
        if (err) {
            console.error('Error getting MySQL connection:', err);
            return res.status(500).send('Database connection error');
        }

        const query = `INSERT INTO courses (course_code, course_name, description, teacher_id, start_date, end_date) VALUES (?, ?, ?, ?, ?, ?)`;
        const values = [courseCode, courseName, description || null, teacherId || null, startDate || null, endDate || null];

        connection.query(query, values, (error, results) => {
            connection.release();
            if (error) {
                console.error('Error adding course:', error);
                if (error.code === 'ER_DUP_ENTRY') {
                    return res.status(409).send('Error: Course Code already exists. Please use a unique code.');
                }
                return res.status(500).send('Error adding course');
            }
            res.redirect('/courses');
        });
    });
});

// GET /enrollments/add: Display form to enroll students in a specific course
app.get('/enrollments/add', async (req, res) => {
    const courseId = req.query.courseId;

    if (!courseId) {
        return res.redirect('/courses');
    }

    pool.getConnection((err, connection) => {
        if (err) {
            console.error('Error getting MySQL connection:', err);
            return res.status(500).send('Database connection error');
        }

        // Fetch selected course details
        const courseQuery = `
            SELECT
                c.course_id,
                c.course_code,
                c.course_name,
                t.first_name AS teacher_first_name,
                t.last_name AS teacher_last_name
            FROM
                courses c
            LEFT JOIN
                teachers t ON c.teacher_id = t.teacher_id
            WHERE
                c.course_id = ?;
        `;

        connection.query(courseQuery, [courseId], (errorCourse, selectedCourse) => {
            if (errorCourse) {
                connection.release();
                console.error('Error fetching selected course:', errorCourse);
                return res.status(500).send('Error retrieving course details');
            }
            if (selectedCourse.length === 0) {
                connection.release();
                return res.status(404).send('Course not found.');
            }

            // Fetch all students (to select from for enrollment)
            connection.query('SELECT student_id, first_name, last_name, student_unique_id FROM students ORDER BY last_name, first_name', (errorStudents, students) => {
                if (errorStudents) {
                    connection.release();
                    console.error('Error fetching students for enrollment:', errorStudents);
                    return res.status(500).send('Error retrieving students');
                }

                // Fetch students already enrolled in this course
                const enrolledQuery = `
                    SELECT
                        e.enrollment_id,
                        s.first_name,
                        s.last_name,
                        e.enrollment_date,
                        e.grade_status
                    FROM
                        enrollments e
                    JOIN
                        students s ON e.student_id = s.student_id
                    WHERE
                        e.course_id = ?
                    ORDER BY
                        s.last_name, s.first_name;
                `;
                connection.query(enrolledQuery, [courseId], (errorEnrolled, enrolledStudents) => {
                    connection.release();
                    if (errorEnrolled) {
                        console.error('Error fetching enrolled students:', errorEnrolled);
                        return res.status(500).send('Error retrieving enrolled students');
                    }

                    // Fetch teachers and all courses again to populate the full courses page
                    connection.query('SELECT teacher_id, first_name, last_name FROM teachers', (errorTeachers, teachers) => {
                        if (errorTeachers) {
                            console.error('Error fetching teachers for courses:', errorTeachers);
                            return res.status(500).send('Error retrieving teachers');
                        }
                        const courseQueryAll = `
                            SELECT
                                c.course_id,
                                c.course_code,
                                c.course_name,
                                c.description,
                                c.start_date,
                                c.end_date,
                                t.first_name AS teacher_first_name,
                                t.last_name AS teacher_last_name
                            FROM
                                courses c
                            LEFT JOIN
                                teachers t ON c.teacher_id = t.teacher_id
                            ORDER BY
                                c.course_name;
                        `;
                        connection.query(courseQueryAll, (errorAllCourses, courses) => {
                            if (errorAllCourses) {
                                console.error('Error fetching all courses:', errorAllCourses);
                                return res.status(500).send('Error retrieving all courses');
                            }
                            res.render('courses', {
                                teachers: teachers,
                                courses: courses,
                                selectedCourse: selectedCourse[0],
                                students: students,
                                enrolledStudents: enrolledStudents
                            });
                        });
                    });
                });
            });
        });
    });
});


// POST /enrollments: Handle enrolling a student in a course
app.post('/enrollments', async (req, res) => {
    const { courseId, studentId } = req.body;

    if (!courseId || !studentId) {
        return res.status(400).send('Course and Student are required for enrollment.');
    }

    pool.getConnection((err, connection) => {
        if (err) {
            console.error('Error getting MySQL connection:', err);
            return res.status(500).send('Database connection error');
        }

        const query = `INSERT INTO enrollments (student_id, course_id, enrollment_date, grade_status) VALUES (?, ?, CURDATE(), 'In Progress')`;
        const values = [studentId, courseId];

        connection.query(query, values, (error, results) => {
            connection.release();
            if (error) {
                console.error('Error enrolling student:', error);
                if (error.code === 'ER_DUP_ENTRY') {
                    return res.status(409).send('Error: Student is already enrolled in this course.');
                }
                return res.status(500).send('Error enrolling student');
            }
            res.redirect(`/enrollments/add?courseId=${courseId}`); // Redirect back to enrollment page for that course
        });
    });
});


// Example of calling the Stored Procedure (e.g., to get a student's summary)
// This route is just an example; you'd integrate it into your UI as needed.
app.get('/student-summary/:studentId', async (req, res) => {
    const studentId = req.params.studentId;

    pool.getConnection((err, connection) => {
        if (err) {
            console.error('Error getting MySQL connection:', err);
            return res.status(500).send('Database connection error');
        }

        // Call the stored procedure
        const query = `CALL GetStudentCourseSummary(?)`;
        connection.query(query, [studentId], (error, results) => {
            connection.release();
            if (error) {
                console.error('Error calling stored procedure:', error);
                return res.status(500).send('Error retrieving student summary');
            }
            // The results from a stored procedure call come in an array of arrays.
            // The actual data is usually in the first element of the results array.
            const studentSummary = results[0];
            res.json(studentSummary); // Send the summary as JSON
            // In a real app, you'd render an EJS template with this data.
        });
    });
});


// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    console.log('Open your browser and navigate to http://localhost:3000');
});