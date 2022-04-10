const express = require('express');
const app = express();
app.use(express.urlencoded({ extended: true }));
const { Server } = require('socket.io');
const http = require('http');
const server = http.createServer(app);
const io = new Server(server);
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
require('dotenv').config()

const indexRouter = require('./routers/indexRouter')
const loginRouter = require('./routers/loginRouter')
const registerRouter = require('./routers/registerRotuer')
const addCourseRouter = require('./routers/addCourseRouter')
const modifyCoursesRouter = require('./routers/modifyCoursesRouter')
const reviewRouter = require('./routers/reviewRouter')
const userPageCommentsRouter = require('./routers/userPageCommentsRouter')
const userPageRouter = require('./routers/userPageRouter')
const courseCommentsRouter = require('./routers/courseCommentsRouter');
const addDepartmentRouter = require('./routers/addDepartmentRouter');

const mongoose = require('mongoose');
const mongoDB = 'mongodb+srv://ahfhafh:jEYduRc7cZmHExJ@cluster0.3cy1i.mongodb.net/users-database?retryWrites=true&w=majority';
mongoose.connect(mongoDB).then(() => {
    console.log("Mongoose connected");
}).catch((err) => console.log(err));

const UserModel = require('./models/user');
const CourseModel = require('./models/course');
const DepartmentModel = require('./models/department');
const FeedbackModel = require('./models/feedback');

const { checkUser } = require('./middleware/authMiddleware');

app.use(express.static('public'));
app.use(express.json());
app.use(cookieParser());

app.get('*', checkUser);
app.use(indexRouter);
app.use(loginRouter);
app.use(registerRouter);
app.use(addCourseRouter);
app.use(modifyCoursesRouter);
app.use(reviewRouter);
app.use(userPageRouter);
app.use(userPageCommentsRouter);
app.use(courseCommentsRouter);
app.use(addDepartmentRouter);

// TODO: move to .env
const JWT_SECRET = "cat";

app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    const user = await UserModel.findOne({ email }).lean();

    if (!user) {
        console.log("Wrong email or password");
        return res.json({ status: 'error', error: 'Wrong email or password' });
    } else if (await bcrypt.compare(password, user.password)) {
        const token = jwt.sign({ id: user._id, isAdmin: user.isAdmin }, JWT_SECRET, { expiresIn: "24h" });
        res.cookie('jwt', token, { httpOnly: true });
        // console.log("Login successful");
        return res.json({ status: 'ok', data: token });
    }

    console.log("Wrong email or password");
    res.json({ status: 'error', error: 'Wrong email or password' });
})

app.post('/api/register', async (req, res) => {
    const { email, password: textPassword } = req.body;
    const password = await bcrypt.hash(textPassword, 5);
    const user = await new UserModel({ email: email, password: password, isAdmin: false });
    user.save((err) => {
        if (err) {
            if (err.code === 11000) {
                console.log("Email has already been registered");
                return res.json({ status: 'error', error: 'Email has already been registered' });
            } else {
                console.log(err);
                return res.json({ status: 'error', error: err });
            }
        }
        console.log("User registered");
        res.json({ status: 'ok' });
    });
})

app.get('/logout', async (req, res) => {
    res.cookie('jwt', '', { maxAge: 1 });
    res.redirect('/');
})

// adds course to Courses and new department if it doesn't exist yet
app.post('/api/addCourse', async (req, res) => {
    const { courseName, courseDescription } = req.body;
    let departmentName = courseName.replace(/[^A-Za-z]/g, '').toUpperCase();
    let findDepartment = await DepartmentModel.findOne({ department: departmentName }).lean();
    var course;
    if (!findDepartment) {
        const newDepartment = await new DepartmentModel({ department: departmentName });
        course = await new CourseModel({ course: courseName, description: courseDescription, department: newDepartment._id });
        newDepartment.save((err) => {
            if (err) {
                console.log(err);
                return res.json({ status: 'error', error: err });
            }
            console.log("Department registered");
        });
        
    } else {
        course = await new CourseModel({ course: courseName, description: courseDescription, department: findDepartment._id });
    }

    try {
        await DepartmentModel.updateOne({ department: departmentName }, { "$push": { courses: course } });
    } catch (err) {
        return res.json({ status: 'error', error: err });
    }

    course.save((err) => {
        if (err) {
            if (err.code === 11000) {
                console.log("This course already exists");
                return res.json({ status: 'error', error: 'This course already exists' });
            } else {
                console.log(err);
                return res.json({ status: 'error', error: err });
            }
        }
        console.log("Course registered");
    });
    res.json({ status: 'ok' });
});

app.post('/api/addReview', checkUser, async (req, res) => {
    const { rating, comment, keywordArr, courseName } = req.body;
    const course = await CourseModel.findOne({ course: courseName });
    const feedback = await new FeedbackModel({ from_user: res.locals.user?.id, comment: comment, rating: rating, comment_votes: 0, keywords: keywordArr, course: course._id });
    feedback.save((err) => {
        if (err) {
            console.log(err);
            return res.json({ status: 'error', error: err });
        }
        console.log("Review added");
    });

    try {
        await CourseModel.updateOne({ course: courseName }, { "$push": { messages: feedback } });
        await UserModel.updateOne({ _id: res.locals.user.id }, { "$push": { messages: feedback } });
    } catch (err) {
        return res.json({ status: 'error', error: err });
    }

    res.json({ status: 'ok' });
});

app.post('/api/upvote', async (req, res) => {
    const { reviewID } = req.body;
    try {
        await FeedbackModel.updateOne({ _id: reviewID }, { "$inc": { comment_votes: 1 } })
    } catch (err) {
        return res.json({ status: 'error', error: err });
    }

    res.json({ status: 'ok' });
});

app.post('/api/downvote', async (req, res) => {
    const { reviewID } = req.body;
    try {
        await FeedbackModel.updateOne({ _id: reviewID }, { "$inc": { comment_votes: -1 } })
    } catch (err) {
        return res.json({ status: 'error', error: err });
    }

    res.json({ status: 'ok' });
});

app.post('/api/deleteCourse', async (req, res) => {
    const { courseName } = req.body;
    try {
        await CourseModel.deleteOne( {course: courseName} );
    } catch (err) {
        return res.json({ status: 'error', error: err });
    }
    
    res.json({ status: 'ok' });
})

server.listen(process.env.PORT || 3000, () => {
    console.log('listening on *:3000');
});