import express from 'express';
import expressAsyncHandler from 'express-async-handler';
import Order from '../models/orderModel.js';
import User from '../models/userModel.js';
import Product from '../models/productModel.js';
import nodemailer from 'nodemailer';
import { isAuth, isAdmin, mailgun, payOrderEmailTemplate } from '../utils.js';

const orderRouter = express.Router();

orderRouter.get(
    '/',
    isAuth,
    isAdmin,
    expressAsyncHandler(async(req, res) => {
        const orders = await Order.find().populate('user', 'name');
        res.send(orders);
    })
);

orderRouter.post(
    '/',
    isAuth,
    expressAsyncHandler(async(req, res) => {
        const newOrder = new Order({
            orderItems: req.body.orderItems.map((x) => ({...x, product: x._id })),
            shippingAddress: req.body.shippingAddress,
            paymentMethod: req.body.paymentMethod,
            itemsPrice: req.body.itemsPrice,
            shippingPrice: req.body.shippingPrice,
            taxPrice: req.body.taxPrice,
            totalPrice: req.body.totalPrice,
            user: req.user._id,
        });

        const order = await newOrder.save();
        const userID = req.user._id;
        Order.findOne({ id: userID }, function(err, order) {
            if (err) throw err;

            console.log("shippingPrice: " + order.shippingPrice);
            console.log("taxPrice: " + order.taxPrice);
            console.log("totalPrice: " + order.totalPrice);
            console.log("address: " + order.shippingAddress.fullName);



            User.findOne({ id: userID }, function(err, user) {
                if (err) throw err;

                console.log("User's email: " + user.email);
                console.log("User's username: " + user.name);



                const transporter = nodemailer.createTransport({
                    service: "gmail",
                    auth: {
                        user: "hoavangtrencoxanh981@gmail.com",
                        pass: "bytakwywycvcglvy"
                    }
                });
                const mailOptions = {
                    from: "hoavangtrencoxanh981@gmail.com",
                    to: user.email,
                    subject: "Xác thực địa chỉ email",
                    text: `Xác thực địa chỉ email`,
                    html: `
<div style="max-width: 700px; margin:auto; border: 10px solid #ddd; padding: 50px 20px; font-size: 110%;">
      <h2 style="text-align: center; text-transform: uppercase;color: teal;">Cám ơn bạn đã đặt hàng tại Đức Phúc!.</h2>

      <p>Xin chào ${order.shippingAddress.fullName},</p>
      <p>Đức Phúc đã nhận được yêu cầu đặt hàng của bạn và đang xử lý nhé. \n
      </p>
      <h2>Đơn hàng được giao đến</h2>
      <p>Tên:             ${order.shippingAddress.fullName}</p>
      <p>Địa chỉ nhà:     ${order.shippingAddress.address}, ${order.shippingAddress.city} ,${order.shippingAddress.country}</p>
      <p>Số điện thoại:   ${order.postalCode} </p>
      <p>Email:           ${user.email}</p>
      <h2>Kiện Hàng</h2>
      <p>Tên sản phẩm:    ${order.orderItems.name}</p>
      <p>Tiền sản phẩm:   ${order.itemsPrice}</p>
      <p>Tiền Ship:       ${order.shippingPrice}</p>
      <p>Tiền Thuế:       ${order.taxPrice}</p>
      <p>Tổng tiền:       ${order.totalPrice}</p>
      `
                };
                const result_ = transporter.sendMail(mailOptions);
            });
        });

        res.status(201).send({ message: 'New Order Created', order });

    })
);

orderRouter.get(
    '/summary',
    isAuth,
    isAdmin,
    expressAsyncHandler(async(req, res) => {
        const orders = await Order.aggregate([{
            $group: {
                _id: null,
                numOrders: { $sum: 1 },
                totalSales: { $sum: '$totalPrice' },
            },
        }, ]);
        const users = await User.aggregate([{
            $group: {
                _id: null,
                numUsers: { $sum: 1 },
            },
        }, ]);
        const dailyOrders = await Order.aggregate([{
                $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                    orders: { $sum: 1 },
                    sales: { $sum: '$totalPrice' },
                },
            },
            { $sort: { _id: 1 } },
        ]);
        const productCategories = await Product.aggregate([{
            $group: {
                _id: '$category',
                count: { $sum: 1 },
            },
        }, ]);
        res.send({ users, orders, dailyOrders, productCategories });
    })
);

orderRouter.get(
    '/mine',
    isAuth,
    expressAsyncHandler(async(req, res) => {
        const orders = await Order.find({ user: req.user._id });
        res.send(orders);
    })
);

orderRouter.get(
    '/:id',
    isAuth,
    expressAsyncHandler(async(req, res) => {
        const order = await Order.findById(req.params.id);
        if (order) {
            res.send(order);
        } else {
            res.status(404).send({ message: 'Order Not Found' });
        }
    })
);

orderRouter.put(
    '/:id/deliver',
    isAuth,
    expressAsyncHandler(async(req, res) => {
        const order = await Order.findById(req.params.id);
        if (order) {
            order.isDelivered = true;
            order.deliveredAt = Date.now();
            await order.save();
            res.send({ message: 'Order Delivered' });
        } else {
            res.status(404).send({ message: 'Order Not Found' });
        }
    })
);

orderRouter.put(
    '/:id/pay',
    isAuth,
    expressAsyncHandler(async(req, res) => {
        const order = await Order.findById(req.params.id).populate(
            'user',
            'email name'
        );
        if (order) {
            order.isPaid = true;
            order.paidAt = Date.now();
            order.paymentResult = {
                id: req.body.id,
                status: req.body.status,
                update_time: req.body.update_time,
                email_address: req.body.email_address,
            };

            const updatedOrder = await order.save();
            mailgun()
                .messages()
                .send({
                        from: 'Amazona <amazona@mg.yourdomain.com>',
                        to: `${order.user.name} <${order.user.email}>`,
                        subject: `New order ${order._id}`,
                        html: payOrderEmailTemplate(order),
                    },
                    (error, body) => {
                        if (error) {
                            console.log(error);
                        } else {
                            console.log(body);
                        }
                    }
                );

            res.send({ message: 'Order Paid', order: updatedOrder });
        } else {
            res.status(404).send({ message: 'Order Not Found' });
        }
    })
);

orderRouter.delete(
    '/:id',
    isAuth,
    isAdmin,
    expressAsyncHandler(async(req, res) => {
        const order = await Order.findById(req.params.id);
        if (order) {
            await order.remove();
            res.send({ message: 'Order Deleted' });
        } else {
            res.status(404).send({ message: 'Order Not Found' });
        }
    })
);

export default orderRouter;