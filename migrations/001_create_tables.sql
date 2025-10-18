-- Create SCED course details table
CREATE TABLE IF NOT EXISTS sced_course_details (
    course_code VARCHAR(20) PRIMARY KEY,
    course_code_description VARCHAR(500),
    course_description TEXT,
    course_subject_area VARCHAR(200),
    course_level VARCHAR(50),
    cte_indicator VARCHAR(10)
);

-- Create certification mappings table
CREATE TABLE IF NOT EXISTS course_certification_mappings (
    id SERIAL PRIMARY KEY,
    course_code VARCHAR(20),
    certification_area_code VARCHAR(20),
    certification_area_description VARCHAR(500),
    FOREIGN KEY (course_code) REFERENCES sced_course_details(course_code)
);

-- Insert sample data
INSERT INTO sced_course_details (course_code, course_code_description, course_description, course_subject_area, course_level, cte_indicator) VALUES
('03001', 'Biology', 'This course provides students with a comprehensive study of living organisms and life processes.', 'Science', 'High School', 'No'),
('20114', 'Introduction to Agriculture', 'This course introduces students to the world of agriculture and its career opportunities.', 'Agriculture, Food & Natural Resources', 'High School', 'Yes'),
('21101', 'Automotive Technology I', 'This course introduces students to automotive systems and basic repair procedures.', 'Transportation, Distribution & Logistics', 'High School', 'Yes');

INSERT INTO course_certification_mappings (course_code, certification_area_code, certification_area_description) VALUES
('03001', '5010', 'Biology (Grades 5-9)'),
('03001', '5020', 'Biology (Grades 7-12)'),
('20114', '8010', 'Agriculture (Grades 5-9)'),
('21101', '9010', 'Technology Education (Grades 5-9)');