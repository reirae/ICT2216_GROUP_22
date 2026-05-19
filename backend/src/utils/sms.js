const twilio = require('twilio');

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

const sendOTP = async (userPhoneNumber, otpCode) => {
    try {
        const message = await client.messages.create({
            body: `SecureBank: Your verification code is ${otpCode}. Do not share this.`,
            from: process.env.TWILIO_PHONE_NUMBER,
            to: userPhoneNumber 
        });
        console.log(`OTP sent to ${userPhoneNumber}. SID: ${message.sid}`);
        return true;
    } catch (error) {
        console.error('Failed to send OTP SMS:', error);
        return false;
    }
};

module.exports = { sendOTP };