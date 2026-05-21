// 1. Open the .env "box of secrets"
require('dotenv').config(); 
const twilio = require('twilio');

// 2. Log into Twilio using your Account SID and Auth Token
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

async function fireSms() {
    console.log("Attempting to send text message...");
    
    try {
        // 3. Draft the text message
        const message = await client.messages.create({
            body: 'Hello from SecureBank! Your test OTP is: 123456',
            from: process.env.TWILIO_PHONE_NUMBER, 
            to: '+6585227536' // CHANGE THIS to your real Singapore mobile number!
        });
        
        console.log('SUCCESS! The message is on its way.');
        console.log('Message SID:', message.sid);
        
    } catch (error) {
        console.error('FAILED to send message. See error below:');
        console.error(error);
    }
}

// Run the function
fireSms();