import express from 'express';
import bcrypt from 'bcryptjs';
import nodemailer from 'nodemailer';
import expressAsyncHandler from 'express-async-handler';
import jwt from 'jsonwebtoken';
import User from '../models/userModel.js';
import { isAuth, isAdmin, generateToken, baseUrl, mailgun } from '../utils.js';


const userRouter = express.Router();
//const nodemailer = require("nodemailer");


userRouter.get(
    '/',
    isAuth,
    isAdmin,
    expressAsyncHandler(async(req, res) => {
        const users = await User.find({});
        res.send(users);
    })
);

userRouter.get(
    '/:id',
    isAuth,
    isAdmin,
    expressAsyncHandler(async(req, res) => {
        const user = await User.findById(req.params.id);
        if (user) {
            res.send(user);
        } else {
            res.status(404).send({ message: 'User Not Found' });
        }
    })
);

userRouter.put(
    '/profile',
    isAuth,
    expressAsyncHandler(async(req, res) => {
        const user = await User.findById(req.user._id);
        if (user) {
            user.name = req.body.name || user.name;
            user.email = req.body.email || user.email;
            if (req.body.password) {
                user.password = bcrypt.hashSync(req.body.password, 8);
            }

            const updatedUser = await user.save();
            res.send({
                _id: updatedUser._id,
                name: updatedUser.name,
                email: updatedUser.email,
                isAdmin: updatedUser.isAdmin,
                token: generateToken(updatedUser),
            });
        } else {
            res.status(404).send({ message: 'User not found' });
        }
    })
);

userRouter.post(
    '/forget-password',
    expressAsyncHandler(async(req, res) => {
        const user = await User.findOne({ email: req.body.email });

        if (user) {
            const token = jwt.sign({ _id: user._id }, process.env.JWT_SECRET, {
                expiresIn: '3h',
            });
            user.resetToken = token;
            await user.save();

            //reset link
            console.log(`${baseUrl()}/reset-password/${token}`);

            mailgun()
                .messages()
                .send({
                        from: 'Amazona <me@mg.yourdomain.com>',
                        to: `${user.name} <${user.email}>`,
                        subject: `Reset Password`,
                        html: ` 
             <p>Please Click the following link to reset your password:</p> 
             <a href="${baseUrl()}/reset-password/${token}"}>Reset Password</a>
             `,
                    },
                    (error, body) => {
                        console.log(error);
                        console.log(body);
                    }
                );
            res.send({ message: 'We sent reset password link to your email.' });
        } else {
            res.status(404).send({ message: 'User not found' });
        }
    })
);

userRouter.post(
    '/reset-password',
    expressAsyncHandler(async(req, res) => {
        jwt.verify(req.body.token, process.env.JWT_SECRET, async(err, decode) => {
            if (err) {
                res.status(401).send({ message: 'Invalid Token' });
            } else {
                const user = await User.findOne({ resetToken: req.body.token });
                if (user) {
                    if (req.body.password) {
                        user.password = bcrypt.hashSync(req.body.password, 8);
                        await user.save();
                        res.send({
                            message: 'Password reseted successfully',
                        });
                    }
                } else {
                    res.status(404).send({ message: 'User not found' });
                }
            }
        });
    })
);

userRouter.put(
    '/:id',
    isAuth,
    isAdmin,
    expressAsyncHandler(async(req, res) => {
        const user = await User.findById(req.params.id);
        if (user) {
            user.name = req.body.name || user.name;
            user.email = req.body.email || user.email;
            user.isAdmin = Boolean(req.body.isAdmin);
            const updatedUser = await user.save();
            res.send({ message: 'User Updated', user: updatedUser });
        } else {
            res.status(404).send({ message: 'User Not Found' });
        }
    })
);

userRouter.delete(
    '/:id',
    isAuth,
    isAdmin,
    expressAsyncHandler(async(req, res) => {
        const user = await User.findById(req.params.id);
        if (user) {
            if (user.email === 'admin@example.com') {
                res.status(400).send({ message: 'Can Not Delete Admin User' });
                return;
            }
            await user.remove();
            res.send({ message: 'User Deleted' });
        } else {
            res.status(404).send({ message: 'User Not Found' });
        }
    })
);
userRouter.post(
    '/signin',
    expressAsyncHandler(async(req, res) => {
        const user = await User.findOne({ email: req.body.email });

        //const user = await User.findOne({ email: req.body.email });
        if (!user) {
            return res.status(400).send({ message: "Tên đăng nhập hoặc mật khẩu không đúng." });
        }

        if (user) {
            if (bcrypt.compareSync(req.body.password, user.password)) {
                res.send({
                    _id: user._id,
                    name: user.name,
                    email: user.email,
                    isAdmin: user.isAdmin,
                    token: generateToken(user),
                });
                return;
            }
        }
        res.status(401).send({ message: 'Invalid email or password' });
    })
);

userRouter.post(
    '/signup',
    expressAsyncHandler(async(req, res) => {

        const verifyCode = Math.floor(100000 + Math.random() * 900000).toString();
        const newUser = new User({
            name: req.body.name,
            email: req.body.email,
            password: bcrypt.hashSync(req.body.password),
            //verificationCode: verifyCode,
        });
        const checkmail = await User.findOne({ email: req.body.email });
        if (checkmail) {
            return res.status(400).send({ message: "Tài khoản Email đã tồn tại." });
        }
        const savedUser = await newUser.save();
        const transporter = nodemailer.createTransport({
            service: "gmail",
            auth: {
                user: "hongduc981981@gmail.com",
                pass: "kddqzypmrkdcyovt"
            }
        });
        const mailOptions = {
            from: "hongduc981981@gmail.com",
            to: req.body.email,
            subject: "Xác thực địa chỉ email",
            text: `Xác thực địa chỉ email`,
            //html: `<p>Mã xác thực của bạn là: <strong>${verifyCode}</strong></p>`
            html: `
      <div style="max-width: 700px; margin:auto; border: 10px solid #ddd; padding: 50px 20px; font-size: 110%;">
            <h2 style="text-align: center; text-transform: uppercase;color: teal;">Chào mừng bạn đến với ĐỨC PHÚC.</h2>
            <p>Chúc mừng bạn! Bạn sẽ bắt bắt đầu sử dụng  Website mua hàng ĐỨC PHÚC
                Hãy nhấp vào nút bên dưới để xác thực địa chỉ email của bạn
            </p>
      <p>Click <a href="http://localhost:3000/signin/" style="background: crimson; 
      text-decoration: none; color: white; padding: 10px 20px; margin: 10px 0; display: inline-block;">ở đây</a> để xác thực email</p>`
        };
        const result = await transporter.sendMail(mailOptions);
        res.status(400).send({ message: 'Đăng ký thành công, vui lòng kiểm tra email để xác thực tài khoản.' });
        // res.json({ msg: "Đăng ký thành công, vui lòng kiểm tra email để xác thực tài khoản." })


    })
);
userRouter.post("/verify", async(req, res) => {
    const user = await User.findOne({ email: req.body.email, verificationCode: req.body.verificationCode });
    if (!user) {
        return res.status(400).send({ message: "Mã xác thực không hợp lệ." });
    }

    user.verified = true;
    user.verificationCode = "";
    await user.save();
    res.send({ message: "Xác thực thành công, bạn có thể đăng nhập vào trang web." });
});

export default userRouter;