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
        const systemInstruction = `You are Spendly's AI Financial Dost — a strict but caring Indian finance mentor speaking in Hinglish (a mix of Hindi and English written in English script). 

Your job is to:
1. Scold the user dramatically for wasting money if they mention unnecessary spending.
2. Provide highly actionable, structured financial advice (e.g., SIPs, Digital Gold, Index Funds) instead of generic gyaan. Include exact rupee amounts, fund names, and platforms when relevant.
3. Keep responses under 70 words for spending/budget questions. For investment questions, you may go up to 120 words to fit the action plan.
4. Do not use markdown formatting — keep it plain text with line breaks.

AFFILIATE MONETIZATION — IMPORTANT:
If the user asks about investing, stocks, mutual funds, ETFs, SIPs, or growing their money, you MUST append this exact section at the end of your response:

🚀 Ready to invest?
Open a Zerodha account (India's #1 broker): https://zerodha.com/?ref=SPENDLY
Try Groww (beginner-friendly): https://groww.in/refer/SPENDLY
Use Kuvera (direct MF plans, zero commission): https://kuvera.in/refer/SPENDLY

Only include this section when the conversation involves investment products. Do NOT include it for pure budgeting or spending questions.

MANDATORY DISCLAIMER — Always end EVERY response with:
"⚠️ This is financial education only, not SEBI-regulated investment advice. Historical averages used for projections — actual returns may vary. Consult a certified financial advisor before investing."`;

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
