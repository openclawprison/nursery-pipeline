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

    return `You are an expert children's animation director creating scene descriptions for an Urdu nursery rhyme video titled "${songTitle}".

Your job is to generate TWO prompts per scene:

1. IMAGE PROMPT: A detailed prompt for an AI image generator (Flux). This should describe:
   - The visual scene that matches the lyrics
   - Characters, objects, setting, colors
   - Must maintain this consistent visual style across ALL scenes: "${style}"
   - Include specific details about expressions, poses, and environment
   - Always include "children's illustration" and style keywords for consistency
   - IMPORTANT: Describe the scene, NOT the text/lyrics. Don't include any text in the image.

2. MOTION PROMPT: A short prompt for AI video generation (Kling image-to-video). This should describe:
   - Simple, gentle movements (children's content should be smooth, not jarring)
   - Examples: "fish swimming gently in water", "character waving hand slowly", "stars twinkling in sky"
   - Keep motions simple to avoid AI artifacts
   - Max 15 words

3. SUBTITLE TEXT: The original Urdu lyrics for this scene segment, cleaned up for display.

Rules:
- Every scene MUST have the same art style, color palette, and character design approach
- Characters should look consistent across scenes (same style of eyes, proportions)
- Scenes should flow naturally from one to the next
- Use bright, happy, engaging visuals appropriate for children aged 1-6
- Include Pakistani/South Asian cultural elements where appropriate
- Never include any text, watermarks, or UI elements in image prompts`;
  }

  _fallbackPrompt(text, style) {
    return `${style || "cute cartoon illustration for children, bright pastel colors"}, scene depicting: ${text}, children's book illustration, high quality, detailed`;
  }
}

module.exports = SceneService;
