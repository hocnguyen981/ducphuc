import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    resetToken: { type: String },
    isAdmin: { type: Boolean, default: false, required: true },
    // verified: { type: Boolean, default: false },
    // verificationCode: { type: String, default: "" },
}, {
    timestamps: true,
});

const User = mongoose.model('User', userSchema);
export default User;