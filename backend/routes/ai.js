const express = require('express');
const router = express.Router();
const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// @route   POST /api/ai/invest-advice
// @desc    Gen-Z sarcastic financial advisor using Gemini
// @access  Public (for MVP)
router.post('/invest-advice', async (req, res) => {
    const { query } = req.body;
    
    if (!query) {
        return res.status(400).json({ success: false, message: 'Missing query parameter.' });
    }

    if (!process.env.GEMINI_API_KEY) {
        // Fallback Mock System if Key is missing
        const mockReply = "Mock Mode: Bhai FD mein daal de, ya thode Mutual Funds lele. (Add GEMINI_API_KEY to .env)";
        return setTimeout(() => res.json({ success: true, reply: mockReply }), 1000);
    }

    try {
        const systemInstruction = `You are an edgy, sarcastic Gen-Z Indian financial educator (a "FinDost"). 
Your goal is to give sound financial advice but deliver it with dry sarcasm, roasting the user gently for bad habits, and using Indian Gen-Z slang (like 'bhai', 'yaar', 'flex', 'FOMO').
Keep responses under 3 paragraphs. Don't use bullet points. Make it sound like a WhatsApp message from a smart, slightly arrogant friend.
Always try to mention specific investment categories if relevant: 'Mutual Funds', 'Gold', or 'FD' so the frontend can trigger action chips.`;

        const promptContext = `${systemInstruction}\n\nUser Question: ${query}\n\nRespond strictly based on this persona.`;

        const response = await ai.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: promptContext
        });

        const replyText = response.text || "Bro, system error. Just don't spend money today.";
        
        res.json({ success: true, reply: replyText });

    } catch (error) {
        console.error("Gemini AI Error:", error);
        res.status(500).json({ success: false, message: 'Failed to process AI request', error: error.message });
    }
});

module.exports = router;
