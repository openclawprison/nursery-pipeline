import { useState, useEffect, useCallback, useRef } from 'react'

const API_BASE = '/api'

// ─── Styles ────────────────────────────────────────────────
const styles = `
  * { margin: 0; padding: 0; box-sizing: border-box; }

  :root {
    --bg: #0a0a0f;
    --bg-card: #12121a;
    --bg-card-hover: #1a1a25;
    --bg-input: #0e0e16;
    --border: #1e1e2e;
    --border-focus: #6c5ce7;
    --text: #e8e6f0;
    --text-dim: #7a7890;
    --text-muted: #4a4860;
    --accent: #6c5ce7;
    --accent-glow: rgba(108, 92, 231, 0.3);
    --green: #00d2a0;
    --green-dim: rgba(0, 210, 160, 0.15);
    --red: #ff6b6b;
    --red-dim: rgba(255, 107, 107, 0.15);
    --yellow: #ffc93c;
    --yellow-dim: rgba(255, 201, 60, 0.15);
    --blue: #54a0ff;
    --blue-dim: rgba(84, 160, 255, 0.15);
    --radius: 12px;
    --font: 'Outfit', -apple-system, sans-serif;
    --font-urdu: 'Noto Nastaliq Urdu', serif;
  }

  body {
    font-family: var(--font);
    background: var(--bg);
    color: var(--text);
    min-height: 100vh;
    -webkit-font-smoothing: antialiased;
  }

  .app {
    max-width: 1200px;
    margin: 0 auto;
    padding: 40px 24px;
  }

  .header {
    text-align: center;
    margin-bottom: 48px;
  }

  .header h1 {
    font-size: 36px;
    font-weight: 800;
    letter-spacing: -1px;
    background: linear-gradient(135deg, #fff 0%, #6c5ce7 50%, #a29bfe 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    margin-bottom: 8px;
  }

  .header p {
    color: var(--text-dim);
    font-size: 15px;
    font-weight: 300;
  }

  .api-status {
    display: inline-flex;
    gap: 12px;
    margin-top: 16px;
    padding: 8px 16px;
    background: var(--bg-card);
    border-radius: 99px;
    border: 1px solid var(--border);
    font-size: 12px;
  }

  .api-dot {
    display: flex;
    align-items: center;
    gap: 5px;
    color: var(--text-dim);
  }

  .api-dot .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
  }

  .dot-ok { background: var(--green); box-shadow: 0 0 6px var(--green); }
  .dot-missing { background: var(--red); box-shadow: 0 0 6px var(--red); }

  .layout {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;
  }

  @media (max-width: 900px) {
    .layout { grid-template-columns: 1fr; }
  }

  .card {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 24px;
  }

  .card-title {
    font-size: 14px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    color: var(--text-dim);
    margin-bottom: 20px;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .card-title .icon { font-size: 16px; }

  label {
    display: block;
    font-size: 13px;
    font-weight: 500;
    color: var(--text-dim);
    margin-bottom: 6px;
    margin-top: 16px;
  }

  label:first-of-type { margin-top: 0; }

  input, textarea, select {
    width: 100%;
    padding: 12px 14px;
    background: var(--bg-input);
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--text);
    font-family: var(--font);
    font-size: 14px;
    transition: border-color 0.2s;
    outline: none;
    -webkit-appearance: none;
  }

  select {
    cursor: pointer;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%237a7890' viewBox='0 0 16 16'%3E%3Cpath d='M8 11L3 6h10z'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 12px center;
    padding-right: 32px;
  }

  select option {
    background: var(--bg-card);
    color: var(--text);
  }

  input:focus, textarea:focus, select:focus {
    border-color: var(--border-focus);
    box-shadow: 0 0 0 3px var(--accent-glow);
  }

  textarea {
    resize: vertical;
    min-height: 180px;
    line-height: 1.7;
  }

  textarea.urdu-input {
    font-family: var(--font-urdu);
    font-size: 18px;
    direction: rtl;
    text-align: right;
  }

  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 14px 28px;
    border: none;
    border-radius: 8px;
    font-family: var(--font);
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    width: 100%;
    margin-top: 24px;
  }

  .btn-primary {
    background: var(--accent);
    color: white;
  }

  .btn-primary:hover:not(:disabled) {
    background: #7c6ef0;
    box-shadow: 0 4px 20px var(--accent-glow);
    transform: translateY(-1px);
  }

  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-download {
    background: var(--green);
    color: #0a0a0f;
    margin-top: 12px;
    text-decoration: none;
  }

  .btn-download:hover {
    background: #00e6b0;
    box-shadow: 0 4px 20px rgba(0, 210, 160, 0.3);
  }

  /* Pipeline Steps */
  .steps-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .step {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    border-radius: 8px;
    border: 1px solid transparent;
    transition: all 0.3s;
  }

  .step.active {
    background: var(--bg-card-hover);
    border-color: var(--accent);
    box-shadow: 0 0 12px var(--accent-glow);
  }

  .step-icon {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    flex-shrink: 0;
  }

  .step-pending .step-icon { background: var(--bg-input); color: var(--text-muted); border: 1px solid var(--border); }
  .step-processing .step-icon { background: var(--blue-dim); color: var(--blue); border: 1px solid var(--blue); animation: pulse 1.5s infinite; }
  .step-complete .step-icon { background: var(--green-dim); color: var(--green); }
  .step-failed .step-icon { background: var(--red-dim); color: var(--red); }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  .step-info { flex: 1; min-width: 0; }
  .step-name { font-size: 14px; font-weight: 500; }
  .step-msg {
    font-size: 12px;
    color: var(--text-dim);
    margin-top: 2px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Progress Bar */
  .progress-bar {
    width: 100%;
    height: 6px;
    background: var(--bg-input);
    border-radius: 3px;
    margin: 16px 0;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--accent), var(--green));
    border-radius: 3px;
    transition: width 0.5s ease;
  }

  /* Jobs History */
  .jobs-section {
    margin-top: 32px;
  }

  .job-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 8px;
    margin-bottom: 8px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .job-item:hover {
    border-color: var(--accent);
    background: var(--bg-card-hover);
  }

  .job-item-left {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }

  .job-title {
    font-size: 14px;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .job-time {
    font-size: 12px;
    color: var(--text-muted);
  }

  .badge {
    padding: 4px 10px;
    border-radius: 99px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    flex-shrink: 0;
  }

  .badge-complete { background: var(--green-dim); color: var(--green); }
  .badge-processing { background: var(--blue-dim); color: var(--blue); }
  .badge-failed { background: var(--red-dim); color: var(--red); }
  .badge-queued { background: var(--yellow-dim); color: var(--yellow); }

  .style-presets {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 8px;
  }

  .preset-chip {
    padding: 5px 12px;
    border-radius: 99px;
    background: var(--bg-input);
    border: 1px solid var(--border);
    color: var(--text-dim);
    font-size: 12px;
    cursor: pointer;
    transition: all 0.2s;
    font-family: var(--font);
  }

  .preset-chip:hover, .preset-chip.active {
    border-color: var(--accent);
    color: var(--text);
    background: var(--accent-glow);
  }

  .error-box {
    padding: 12px 16px;
    background: var(--red-dim);
    border: 1px solid rgba(255, 107, 107, 0.3);
    border-radius: 8px;
    color: var(--red);
    font-size: 13px;
    margin-top: 16px;
  }

  .empty-state {
    text-align: center;
    padding: 40px 20px;
    color: var(--text-muted);
    font-size: 14px;
  }

  .scene-preview {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 8px;
    margin-top: 12px;
  }

  .scene-thumb {
    aspect-ratio: 16/9;
    border-radius: 6px;
    background: var(--bg-input);
    border: 1px solid var(--border);
    overflow: hidden;
  }

  .scene-thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .hint {
    font-size: 11px;
    color: var(--text-muted);
    margin-top: 4px;
    font-style: italic;
  }
`

// ─── Step Definitions ──────────────────────────────────────
const STEPS = [
  { key: 'suno', name: 'Generate Song', icon: '🎵', desc: 'Suno AI creates the audio' },
  { key: 'whisper', name: 'Extract Timestamps', icon: '⏱️', desc: 'Whisper detects verse timing' },
  { key: 'scene', name: 'Scene Descriptions', icon: '🎬', desc: 'Claude writes visual prompts' },
  { key: 'image', name: 'Generate Images', icon: '🖼️', desc: 'Flux creates scene artwork' },
  { key: 'video', name: 'Animate Clips', icon: '🎥', desc: 'Kling animates each scene' },
  { key: 'assembly', name: 'Final Assembly', icon: '✨', desc: 'FFmpeg compiles the video' }
]

const VISUAL_PRESETS = [
  { label: 'Cute Cartoon', value: "cute cartoon illustration for children, bright pastel colors, rounded characters with big eyes, Pakistani/South Asian setting, watercolor texture, children's book illustration" },
  { label: '3D Pixar Style', value: "3D animated Pixar-style characters, bright colorful scene, soft lighting, children's animation, South Asian characters, cute round faces" },
  { label: 'Watercolor', value: "soft watercolor painting, dreamy pastel colors, gentle brushstrokes, children's storybook illustration, South Asian cultural elements" },
  { label: 'Flat Vector', value: "modern flat vector illustration, bold bright colors, geometric shapes, clean lines, children's educational content style, minimalist" },
  { label: 'Anime', value: "anime style children's illustration, kawaii aesthetic, bright vivid colors, expressive big eyes, cute characters, South Asian setting" }
]

const SONG_STYLE_PRESETS = [
  { label: 'Classic Nursery', value: "children's nursery rhyme, female vocalist, happy, warm, simple melody" },
  { label: 'Upbeat Fun', value: "upbeat children's song, energetic, playful, clapping rhythm, fun, catchy" },
  { label: 'Soft Lullaby', value: "soft lullaby, gentle, soothing, female vocalist, calm, bedtime" },
  { label: 'Educational Pop', value: "educational pop song for kids, catchy, rhythmic, learning, cheerful" }
]

const LANGUAGES = [
  { label: 'Auto-detect', value: 'auto' },
  { label: 'Urdu', value: 'ur' },
  { label: 'Hindi', value: 'hi' },
  { label: 'English', value: 'en' },
  { label: 'Arabic', value: 'ar' },
  { label: 'Turkish', value: 'tr' },
  { label: 'Bengali', value: 'bn' },
  { label: 'Spanish', value: 'es' },
  { label: 'French', value: 'fr' },
  { label: 'Chinese', value: 'zh' },
  { label: 'Japanese', value: 'ja' },
  { label: 'Korean', value: 'ko' },
  { label: 'Punjabi', value: 'pa' },
  { label: 'Persian', value: 'fa' },
  { label: 'Malay', value: 'ms' },
  { label: 'Indonesian', value: 'id' },
  { label: 'Pashto', value: 'ps' },
  { label: 'Sindhi', value: 'sd' }
]

const RESOLUTIONS = [
  { label: '720p (1280×720) — fastest, lowest cost', value: '1280x720' },
  { label: '1080p (1920×1080) — recommended', value: '1920x1080' },
  { label: '1440p (2560×1440) — highest quality', value: '2560x1440' }
]

const VIDEO_PROVIDERS = [
  { label: 'WAN 2.1 — cheapest (~$0.20/clip)', value: 'wan21' },
  { label: 'Seedance 1.0 Lite (~$0.15/clip)', value: 'seedance1' },
  { label: 'Seedance 2.0 — best value (~$0.05/clip)', value: 'seedance2' },
  { label: 'Kling 2.5 Turbo — premium (~$0.35/clip)', value: 'kling' }
]

// ─── App Component ─────────────────────────────────────────
export default function App() {
  const [lyrics, setLyrics] = useState('')
  const [songTitle, setSongTitle] = useState('')
  const [songStyle, setSongStyle] = useState(SONG_STYLE_PRESETS[0].value)
  const [visualStyle, setVisualStyle] = useState(VISUAL_PRESETS[0].value)
  const [channelName, setChannelName] = useState('')
  const [language, setLanguage] = useState('ur')
  const [resolution, setResolution] = useState('1280x720')
  const [videoProvider, setVideoProvider] = useState('wan21')
  const [subtitles, setSubtitles] = useState(true)

  const [jobs, setJobs] = useState([])
  const [activeJob, setActiveJob] = useState(null)
  const [health, setHealth] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const pollRef = useRef(null)

  // Check API health on mount
  useEffect(() => {
    fetch(`${API_BASE}/health`)
      .then(r => r.json())
      .then(setHealth)
      .catch(() => setHealth(null))
  }, [])

  // Poll for job updates
  useEffect(() => {
    const poll = () => {
      fetch(`${API_BASE}/jobs`)
        .then(r => r.json())
        .then(data => {
          setJobs(data)
          // Update active job if we have one
          if (activeJob) {
            const updated = data.find(j => j.id === activeJob.id)
            if (updated) setActiveJob(updated)
          }
        })
        .catch(() => {})
    }

    poll()
    pollRef.current = setInterval(poll, 3000)
    return () => clearInterval(pollRef.current)
  }, [activeJob?.id])

  const handleSubmit = async () => {
    if (!lyrics.trim() || !songTitle.trim()) return
    setSubmitting(true)

    try {
      const res = await fetch(`${API_BASE}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lyrics, songTitle, songStyle, visualStyle, channelName, language, resolution, videoProvider, imageModel: 'dev', subtitles })
      })
      const data = await res.json()
      if (data.success) {
        setActiveJob({ id: data.jobId, status: 'queued', progress: 0, steps: {} })
        // Reset form
        setLyrics('')
        setSongTitle('')
      }
    } catch (err) {
      console.error('Submit failed:', err)
    } finally {
      setSubmitting(false)
    }
  }

  const viewing = activeJob || (jobs.length > 0 ? jobs[0] : null)

  return (
    <>
      <style>{styles}</style>
      <div className="app">
        <div className="header">
          <h1>🎬 Nursery Rhyme Studio</h1>
          <p>Urdu lyrics in → AI-animated music video out</p>
          {health && (
            <div className="api-status">
              {['suno', 'fal', 'openai', 'anthropic'].map(api => (
                <div className="api-dot" key={api}>
                  <div className={`dot ${health.apis?.[api] ? 'dot-ok' : 'dot-missing'}`} />
                  {api}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="layout">
          {/* LEFT: Input Form */}
          <div>
            <div className="card">
              <div className="card-title"><span className="icon">📝</span> New Video</div>

              <label>Language</label>
              <select value={language} onChange={e => setLanguage(e.target.value)}>
                {LANGUAGES.map(l => (
                  <option key={l.value} value={l.value}>{l.label}</option>
                ))}
              </select>

              <label>Song Title</label>
              <input
                type="text"
                placeholder={['ur','ar','fa','ps','sd'].includes(language) ? 'گانے کا نام لکھیں...' : 'Enter song title...'}
                value={songTitle}
                onChange={e => setSongTitle(e.target.value)}
                style={['ur','ar','fa','ps','sd'].includes(language)
                  ? { fontFamily: 'var(--font-urdu)', direction: 'rtl', textAlign: 'right' }
                  : {}
                }
              />

              <label>Lyrics</label>
              <textarea
                className={['ur','ar','fa','ps','sd'].includes(language) ? 'urdu-input' : ''}
                placeholder={['ur','ar','fa','ps','sd'].includes(language) ? 'یہاں نظم لکھیں...' : 'Paste your complete lyrics here...'}
                value={lyrics}
                onChange={e => setLyrics(e.target.value)}
              />
              <div className="hint">Each line/verse will become a scene in your video.</div>

              <label>Song Style</label>
              <div className="style-presets">
                {SONG_STYLE_PRESETS.map(p => (
                  <button
                    key={p.label}
                    className={`preset-chip ${songStyle === p.value ? 'active' : ''}`}
                    onClick={() => setSongStyle(p.value)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={songStyle}
                onChange={e => setSongStyle(e.target.value)}
                placeholder="Or type custom style tags..."
                style={{ marginTop: '8px', fontSize: '12px' }}
              />

              <label>Visual Style</label>
              <div className="style-presets">
                {VISUAL_PRESETS.map(p => (
                  <button
                    key={p.label}
                    className={`preset-chip ${visualStyle === p.value ? 'active' : ''}`}
                    onClick={() => setVisualStyle(p.value)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={visualStyle}
                onChange={e => setVisualStyle(e.target.value)}
                placeholder="Or type custom visual style..."
                style={{ marginTop: '8px', fontSize: '12px' }}
              />

              <label>Resolution</label>
              <select value={resolution} onChange={e => setResolution(e.target.value)}>
                {RESOLUTIONS.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>

              <label>Video Model</label>
              <select value={videoProvider} onChange={e => setVideoProvider(e.target.value)}>
                {VIDEO_PROVIDERS.map(v => (
                  <option key={v.value} value={v.value}>{v.label}</option>
                ))}
              </select>
              <div className="hint">
                {videoProvider === 'seedance2' ? 'Requires ModelsLab API key (modelslab.com)' :
                 'Uses your fal.ai key'}
              </div>

              <label>Channel Name (optional)</label>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '16px', marginBottom: '4px' }}>
                <label style={{ margin: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="checkbox"
                    checked={subtitles}
                    onChange={e => setSubtitles(e.target.checked)}
                    style={{ width: 'auto', accentColor: 'var(--accent)', cursor: 'pointer' }}
                  />
                  Show subtitles (lyrics on screen)
                </label>
              </div>
              <input
                type="text"
                placeholder="e.g. Nursery Rhymes"
                value={channelName}
                onChange={e => setChannelName(e.target.value)}
              />

              <button
                className="btn btn-primary"
                onClick={handleSubmit}
                disabled={submitting || !lyrics.trim() || !songTitle.trim()}
              >
                {submitting ? '⏳ Submitting...' : '🚀 Generate Video'}
              </button>
            </div>
          </div>

          {/* RIGHT: Pipeline Progress */}
          <div>
            <div className="card">
              <div className="card-title"><span className="icon">⚡</span> Pipeline</div>

              {viewing ? (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '14px', fontWeight: 500 }}>
                      {viewing.title || viewing.input?.songTitle || 'Untitled'}
                    </span>
                    <span className={`badge badge-${viewing.status}`}>
                      {viewing.status}
                    </span>
                  </div>

                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${viewing.progress || 0}%` }} />
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px', textAlign: 'right' }}>
                    {viewing.progress || 0}%
                  </div>

                  <div className="steps-list">
                    {STEPS.map(step => {
                      const stepData = viewing.steps?.[step.key] || {}
                      const status = stepData.status || 'pending'
                      const isActive = viewing.currentStep === step.key

                      return (
                        <div key={step.key} className={`step step-${status} ${isActive ? 'active' : ''}`}>
                          <div className="step-icon">
                            {status === 'complete' ? '✓' :
                             status === 'failed' ? '✗' :
                             status === 'processing' ? '◉' :
                             '○'}
                          </div>
                          <div className="step-info">
                            <div className="step-name">{step.icon} {step.name}</div>
                            <div className="step-msg">
                              {stepData.message || step.desc}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {viewing.error && (
                    <div className="error-box">
                      ❌ {viewing.error}
                    </div>
                  )}

                  {viewing.status === 'complete' && viewing.hasVideo && (
                    <a
                      className="btn btn-download"
                      href={`${API_BASE}/jobs/${viewing.id}/video`}
                      download
                    >
                      📥 Download Video
                    </a>
                  )}
                </>
              ) : (
                <div className="empty-state">
                  No jobs yet. Create your first video above!
                </div>
              )}
            </div>

            {/* Job History */}
            {jobs.length > 0 && (
              <div className="jobs-section">
                <div className="card">
                  <div className="card-title"><span className="icon">📋</span> History</div>
                  {jobs.map(job => (
                    <div
                      key={job.id}
                      className="job-item"
                      onClick={() => setActiveJob(job)}
                      style={viewing?.id === job.id ? { borderColor: 'var(--accent)' } : {}}
                    >
                      <div className="job-item-left">
                        <div>
                          <div className="job-title">{job.title || 'Untitled'}</div>
                          <div className="job-time">
                            {new Date(job.createdAt).toLocaleString()}
                          </div>
                        </div>
                      </div>
                      <span className={`badge badge-${job.status}`}>
                        {job.status === 'processing' ? `${job.progress}%` : job.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
