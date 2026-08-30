const express = require('express');
const router = express.Router();
const { GoogleGenAI } = require('@google/genai');
const { protect } = require('../middleware/authMiddleware');
const { proGate } = require('../middleware/proGate');

let ai = null;
if (process.env.GEMINI_API_KEY) {
    ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
} else {
    console.warn('⚠️  GEMINI_API_KEY not set — Chatbot will run in mock mode.');
}

// @route   POST /api/chatbot/msg
// @desc    Send message to AI Financial Dost
// @access  Protected
router.post('/msg', protect, proGate('chat_message'), async (req, res) => {
    const { message } = req.body;
    
    // Fallback Mock System if Key is missing
    if (!process.env.GEMINI_API_KEY) {
        const mockReply = "(Mock Mode - Add GEMINI_API_KEY to .env)\\nBhai kya kar raha hai tu? Bewajah ka kharcha kiya aaj fir. Paise ped pe thodi ugte hain yaar, strict ban thoda aur is paise ko SIP mein daal de chup-chap.";
        return setTimeout(() => res.json({ success: true, reply: mockReply }), 1000);
    }

    try {
        const systemInstruction = "You are a strict, sarcastic Indian parent/mentor speaking in Hinglish (a mix of Hindi and English written in English script). Your job is to scold the user dramatically for wasting money like a typical strict Indian parent or friend, and firmly tell them to invest in SIPs, Digital Gold, or Index Funds instead. Keep responses under 50 words. Do not use markdown, just plain text.";

        const promptContext = `${systemInstruction}\\n\\nUser Message: ${message}\\n\\nRespond strictly based on this persona.`;

        const response = await ai.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: promptContext
        });

        const replyText = response.text || "I couldn't process that. Stop spending!";
        
        res.json({ success: true, reply: replyText });

    } catch (error) {
        console.error("Gemini AI Error:", error);
        res.status(500).json({ success: false, message: 'Failed to process AI request', error: error.message });
    }
});

module.exports = router;
