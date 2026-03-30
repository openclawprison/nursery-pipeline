const Anthropic = require('@anthropic-ai/sdk');

class SceneService {
  constructor() {
    this._client = null;
  }

  get client() {
    if (!this._client) {
      if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured');
      this._client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    }
    return this._client;
  }

  /**
   * Generate image prompts for each scene segment
   * @param {Array} sceneSegments - Array of { id, text, start, end, duration }
   * @param {string} fullLyrics - Complete lyrics for context
   * @param {string} visualStyle - User's chosen visual style description
   * @param {string} songTitle - Title of the song
   * @returns {Array} scenes with added imagePrompt and motionPrompt fields
   */
  async generateSceneDescriptions(sceneSegments, fullLyrics, visualStyle, songTitle) {
    console.log(`[SCENE] Generating descriptions for ${sceneSegments.length} scenes`);

    const systemPrompt = this._buildSystemPrompt(visualStyle, songTitle);

    // Build the request for all scenes at once (more efficient, better consistency)
    const scenesText = sceneSegments
      .map((seg, i) => `Scene ${i + 1} (${seg.start.toFixed(1)}s - ${seg.end.toFixed(1)}s):\nLyrics: "${seg.text}"`)
      .join('\n\n');

    const userPrompt = `Here are the complete lyrics for reference:
"""
${fullLyrics}
"""

Now generate image prompts and motion prompts for each scene:

${scenesText}

Respond in this exact JSON format (no markdown, no backticks, just raw JSON):
{
  "scenes": [
    {
      "scene_id": 0,
      "image_prompt": "detailed image generation prompt here",
      "motion_prompt": "simple motion/animation description for video generation",
      "subtitle_text": "the Urdu text to display as subtitle"
    }
  ]
}`;

    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    });

    const responseText = response.content[0].text;

    // Parse the JSON response
    let parsed;
    try {
      // Try to extract JSON if there's any wrapper text
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        parsed = JSON.parse(responseText);
      }
    } catch (err) {
      console.error('[SCENE] Failed to parse Claude response:', responseText.substring(0, 500));
      throw new Error('Failed to parse scene descriptions from Claude');
    }

    // Merge back into scene segments
    const enrichedScenes = sceneSegments.map((seg, idx) => {
      const sceneData = parsed.scenes[idx] || {};
      return {
        ...seg,
        imagePrompt: sceneData.image_prompt || this._fallbackPrompt(seg.text, visualStyle),
        motionPrompt: sceneData.motion_prompt || 'gentle movement, slight zoom in',
        subtitleText: sceneData.subtitle_text || seg.text
      };
    });

    console.log(`[SCENE] Generated ${enrichedScenes.length} scene descriptions`);
    return enrichedScenes;
  }

  _buildSystemPrompt(visualStyle, songTitle) {
    const defaultStyle = "cute cartoon illustration for children, bright pastel colors, rounded characters with big eyes, Pakistani/South Asian setting, watercolor texture, children's book illustration style";
    const style = visualStyle || defaultStyle;

    return `You are creating scene visuals for a children's nursery rhyme video titled "${songTitle}".

MOST IMPORTANT RULE: Each scene MUST directly and literally illustrate what the lyrics are saying. 
- If lyrics say "bear went on a train" → show a bear on a train
- If lyrics say "fish is queen of water" → show a fish wearing a crown in water
- Do NOT invent scenes that are not described in the lyrics
- Do NOT add random characters or settings that the lyrics don't mention
- Follow the STORY of the lyrics scene by scene

VISUAL STYLE (use this EXACT style for every single scene): "${style}"

CONSISTENCY RULES:
- Same characters must look identical across all scenes (same colors, proportions, style)
- Same background style and color palette throughout
- If a character appears in scene 1 and scene 5, they must look the same

For each scene provide:
1. IMAGE PROMPT: A detailed description of EXACTLY what the lyrics describe, rendered in the visual style above. No text or words in the image. Be very specific about what characters are doing.
2. MOTION PROMPT: Simple gentle movement matching the lyrics action. Max 15 words. Keep it simple.
3. SUBTITLE TEXT: The original lyrics for this scene, cleaned up for display.`;
  }

  _fallbackPrompt(text, style) {
    return `${style || "cute cartoon illustration for children, bright pastel colors"}, scene depicting: ${text}, children's book illustration, high quality, detailed`;
  }
}

module.exports = SceneService;
