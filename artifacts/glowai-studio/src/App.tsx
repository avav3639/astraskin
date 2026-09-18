import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  Camera,
  Check,
  CircleHelp,
  Gem,
  LockKeyhole,
  Moon,
  Palette,
  Paintbrush,
  RefreshCw,
  RotateCcw,
  Scissors,
  ShieldCheck,
  Sparkles,
  SunMedium,
  Upload,
  WandSparkles,
} from 'lucide-react';
import NotFound from '@/pages/not-found';
import { Route, Switch, Router as WouterRouter, useLocation } from 'wouter';

const queryClient = new QueryClient();

type SampleKind = 'light' | 'dark';
type PhotoPoint = { x: number; y: number; hex: string; rgb: [number, number, number] };
type Analysis = {
  undertone: string;
  skinTone: string;
  faceShape: string;
  contrast: string;
  season: string;
  seasonDetail: string;
  jewelry: string;
  recommendation: string;
  colors: string[];
};
type GuideSet = { makeup: string[]; hair: string[]; kit: string[] };
type StarBurst = { id: number; x: number; y: number };

const REVEAL_LABELS = ['undertone', 'skin tone', 'face shape', 'contrast', 'season', 'jewelry mood', 'north star'];

const INITIAL_GUIDES: GuideSet = {
  makeup: [
    'Start with a sheer skin tint and let your real skin show through.',
    'Sweep your most luminous sample across the lid as a soft wash.',
    'Finish with a blurred lip in a shade one step brighter than your natural tone.',
  ],
  hair: [
    'Ask for dimensional ribbons rather than a single all-over color.',
    'Keep the brightest pieces around the eyes to make your palette feel intentional.',
    'Use a satin-finish oil on the ends for a light-catching finish.',
  ],
  kit: [
    'A small dual-fiber brush for sheer, buildable color.',
    'A satin cream shadow or cheek tint in your light swatch.',
    'A wide-tooth comb and lightweight glossing mist.',
  ],
};

function hexFromRgb(r: number, g: number, b: number) {
  return `#${[r, g, b].map((value) => value.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

function luminance(rgb: [number, number, number]) {
  return (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
}

function skinToneFromLightness(lightness: number) {
  if (lightness >= 0.72) return 'Light';
  if (lightness >= 0.57) return 'Medium light';
  if (lightness >= 0.42) return 'Brown';
  if (lightness >= 0.27) return 'Dark brown';
  return 'Black';
}

function faceShapeFromPoints(light: PhotoPoint, dark: PhotoPoint) {
  const centerOffset = Math.abs((light.x + dark.x) / 2 - 450) / 450;
  const verticalSpread = Math.abs(light.y - dark.y) / 620;
  if (verticalSpread > 0.48) return 'Oblong';
  if (centerOffset > 0.34) return 'Heart';
  if (verticalSpread < 0.18) return 'Round';
  if (light.x < dark.x) return 'Square';
  return 'Oval';
}

function detectAutomaticPoints(
  context: CanvasRenderingContext2D,
  region: { x: number; y: number; width: number; height: number },
) {
  const regionX = Math.max(0, Math.floor(region.x));
  const regionY = Math.max(0, Math.floor(region.y));
  const width = Math.max(1, Math.floor(region.width));
  const height = Math.max(1, Math.floor(region.height));
  const pixels = context.getImageData(regionX, regionY, width, height).data;
  let lightCandidate: { score: number; point: PhotoPoint } | null = null;
  let darkCandidate: { score: number; point: PhotoPoint } | null = null;
  const startX = Math.floor(regionX + width * 0.08);
  const endX = Math.floor(regionX + width * 0.92);
  const startY = Math.floor(regionY + height * 0.08);
  const endY = Math.floor(regionY + height * 0.92);

  for (let y = startY; y < endY; y += 8) {
    for (let x = startX; x < endX; x += 8) {
      const offset = ((y - regionY) * width + (x - regionX)) * 4;
      const r = pixels[offset];
      const g = pixels[offset + 1];
      const b = pixels[offset + 2];
      const rgb: [number, number, number] = [r, g, b];
      const value = luminance(rgb);
      const point = { x, y, rgb, hex: hexFromRgb(r, g, b) };
      if (!lightCandidate || value > lightCandidate.score) lightCandidate = { score: value, point };
      if (!darkCandidate || value < darkCandidate.score) darkCandidate = { score: value, point };
    }
  }

  return {
    light: lightCandidate?.point ?? null,
    dark: darkCandidate?.point ?? null,
  };
}

function makeAnalysis(light: PhotoPoint, dark: PhotoPoint): Analysis {
  const lightness = luminance(light.rgb);
  const darkness = luminance(dark.rgb);
  const contrastScore = Math.round(Math.abs(lightness - darkness) * 100);
  const warmSignal = light.rgb[0] + dark.rgb[0] - light.rgb[2] - dark.rgb[2];
  const undertone = warmSignal > 18 ? 'Warm leaning' : warmSignal < -18 ? 'Cool leaning' : 'Balanced neutral';
  const highContrast = contrastScore > 42;
  const skinTone = skinToneFromLightness(lightness);
  const faceShape = faceShapeFromPoints(light, dark);
  const season = undertone === 'Warm leaning'
    ? (highContrast ? 'True Autumn' : 'Soft Spring')
    : undertone === 'Cool leaning'
      ? (highContrast ? 'Clear Winter' : 'Soft Summer')
      : (highContrast ? 'Deep Winter' : 'Muted Summer');
  const colors = undertone === 'Warm leaning'
    ? ['#F6C36A', '#D98270', '#9E5872', '#293A67', '#F4E4C1']
    : undertone === 'Cool leaning'
      ? ['#A7C9F2', '#CE8BB8', '#5A518F', '#304C68', '#E7D8F2']
      : ['#D8B6A4', '#A98AC2', '#7589B5', '#D8C579', '#EFE3DB'];
  return {
    undertone,
    skinTone,
    faceShape,
    contrast: highContrast ? `High contrast · ${contrastScore}%` : `Gentle contrast · ${contrastScore}%`,
    season,
    seasonDetail: highContrast
      ? 'Your features hold their shape next to clear, saturated color.'
      : 'Your features glow beside blended, softly layered color.',
    jewelry: undertone === 'Warm leaning' ? 'Brushed gold & champagne' : undertone === 'Cool leaning' ? 'Silver & white gold' : 'Mixed metals, softly layered',
    recommendation: highContrast
      ? 'Choose one clear focal color and let the rest of your look stay quietly luminous.'
      : 'Build tone-on-tone looks with a little sparkle at the center of the face.',
    colors,
  };
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={GlowStudio} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function GlowStudio() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [photoUrl, setPhotoUrl] = useState('');
  const [photoName, setPhotoName] = useState('');
  const [points, setPoints] = useState<Record<SampleKind, PhotoPoint | null>>({ light: null, dark: null });
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [guides, setGuides] = useState<GuideSet | null>(null);
  const [wish, setWish] = useState('');
  const [products, setProducts] = useState('');
  const [toast, setToast] = useState('');
  const [revealStep, setRevealStep] = useState(0);
  const [bursts, setBursts] = useState<StarBurst[]>([]);
  const burstId = useRef(0);

  const drawImage = (url: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const image = new window.Image();
    image.onload = () => {
      const context = canvas.getContext('2d');
      if (!context) return;
      canvas.width = 900;
      canvas.height = 620;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = '#120D25';
      context.fillRect(0, 0, canvas.width, canvas.height);
      const scale = Math.min(canvas.width / image.width, canvas.height / image.height);
      const width = image.width * scale;
      const height = image.height * scale;
      const imageX = (canvas.width - width) / 2;
      const imageY = (canvas.height - height) / 2;
      context.drawImage(image, imageX, imageY, width, height);
      const automaticPoints = detectAutomaticPoints(context, { x: imageX, y: imageY, width, height });
      setPoints(automaticPoints);
      setToast('Lightest and darkest spots found automatically.');
    };
    image.src = url;
  };

  useEffect(() => {
    if (photoUrl) drawImage(photoUrl);
  }, [photoUrl]);

  useEffect(() => () => {
    if (photoUrl) URL.revokeObjectURL(photoUrl);
  }, [photoUrl]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const handleDocumentClick = (event: globalThis.MouseEvent) => {
      const id = burstId.current++;
      setBursts((current) => [...current.slice(-5), { id, x: event.clientX, y: event.clientY }]);
      window.setTimeout(() => {
        setBursts((current) => current.filter((burst) => burst.id !== id));
      }, 850);
    };
    document.addEventListener('click', handleDocumentClick);
    return () => document.removeEventListener('click', handleDocumentClick);
  }, []);

  const handleFile = (file?: File) => {
    if (!file || !file.type.startsWith('image/')) {
      setToast('Choose a JPG, PNG, or HEIC photo to begin.');
      return;
    }
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    setPhotoName(file.name);
    setPhotoUrl(URL.createObjectURL(file));
    setPoints({ light: null, dark: null });
    setAnalysis(null);
    setGuides(null);
    setRevealStep(0);
    setToast('Photo loaded. Finding the lightest and darkest spots.');
  };

  const runAnalysis = () => {
    if (!points.light || !points.dark) {
      setToast('Choose both a light and dark sample before reading your palette.');
      return;
    }
    setIsAnalyzing(true);
    window.setTimeout(() => {
      setAnalysis(makeAnalysis(points.light as PhotoPoint, points.dark as PhotoPoint));
      setRevealStep(0);
      setIsAnalyzing(false);
      setToast('Your read is ready. Reveal it one signal at a time.');
      window.setTimeout(() => document.getElementById('analysis')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    }, 480);
  };

  const resetStudio = () => {
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    setPhotoUrl('');
    setPhotoName('');
    setPoints({ light: null, dark: null });
    setAnalysis(null);
    setGuides(null);
    setRevealStep(0);
    setToast('Studio reset. Whenever you are ready.');
  };

  const revealNext = () => {
    if (!analysis || revealStep >= REVEAL_LABELS.length) return;
    const nextStep = revealStep + 1;
    setRevealStep(nextStep);
    setToast(nextStep === REVEAL_LABELS.length ? 'Your constellation is complete.' : `${REVEAL_LABELS[nextStep - 1]} just came into focus.`);
  };

  const generateGuides = () => {
    setIsGenerating(true);
    window.setTimeout(() => {
      const wantsWarmth = `${wish} ${products}`.toLowerCase().includes('warm');
      const focus = wish.trim() || 'a polished everyday look';
      const kit = products.split(',').map((item) => item.trim()).filter(Boolean);
      setGuides({
        makeup: [
          `For ${focus.toLowerCase()}, keep the base sheer and put your brightest sample where light naturally lands.`,
          wantsWarmth ? 'Melt a warm peach or honey tone over cheeks, lids, and lips for one continuous glow.' : 'Echo one of your palette colors on the cheeks and lips so the look feels collected, not matched.',
          'Press a pinpoint of reflective color at the inner corner, then soften every edge with a clean brush.',
        ],
        hair: [
          'Keep the silhouette touchable: a soft bend or airy lift lets your personal color story lead.',
          analysis?.contrast.includes('High') ? 'Ask for a brighter face frame with a deeper root for beautiful, graphic dimension.' : 'Ask for low-contrast ribbons that blur gently into your natural base.',
          'A cool satin or pearl finish will catch the same light as your new makeup palette.',
        ],
        kit: kit.length > 0
          ? kit.slice(0, 4).map((item) => `Use ${item} as your starting point, then keep the finish light enough to see your real features.`)
          : INITIAL_GUIDES.kit,
      });
      setIsGenerating(false);
      setToast('Your guide has entered orbit.');
    }, 900);
  };

  const pointStyle = (point: PhotoPoint | null) => point
    ? { left: `${point.x / 9}%`, top: `${point.y / 6.2}%` }
    : undefined;

  return (
    <main className="studio-shell">
      <div className="star-field" aria-hidden="true" />
      <div className="ambient-orbit one" aria-hidden="true" />
      <div className="ambient-orbit two" aria-hidden="true" />
      {isAnalyzing && (
        <div className="analysis-loading" role="status" aria-live="polite">
          <div className="analysis-loading-card">
            <div className="orbit-scene" aria-hidden="true">
              <div className="orbit-ring"><span className="loader-moon"><Moon size={20} /></span></div>
              <div className="loader-planet"><span /></div>
            </div>
            <div className="panel-kicker">reading your constellation</div>
            <h2>Finding your signals.</h2>
            <p>Light, depth, and proportion are settling into place.</p>
          </div>
        </div>
      )}
      {bursts.map((burst) => (
        <span className="star-burst" key={burst.id} style={{ left: burst.x, top: burst.y }} aria-hidden="true">
          {Array.from({ length: 8 }, (_, index) => (
            <i key={index} style={{ '--spark-angle': `${index * 45}deg`, '--spark-distance': `${22 + (index % 3) * 10}px` } as CSSProperties} />
          ))}
        </span>
      ))}
      <header className="topbar">
        <a href="#top" className="brandmark" data-testid="link-brand">
          <span className="brand-orb"><Sparkles size={18} strokeWidth={1.7} /></span>
          <span><span className="brand-name">ASTRA</span><span className="brand-tag"> / studio</span></span>
        </a>
        <nav className="topnav" aria-label="Studio sections">
          <a href="#studio" data-testid="link-studio">Studio</a>
          <a href="#analysis" data-testid="link-analysis">Your read</a>
          <a href="#guides" data-testid="link-guides">Guides</a>
        </nav>
        <span className="top-status"><span className="status-dot" /> local & private</span>
      </header>

      <div className="page-content" id="top">
        <section className="hero" aria-labelledby="hero-title">
          <div>
            <div className="eyebrow"><span className="eyebrow-line" /> personal color intelligence</div>
            <h1 id="hero-title">Find the colors that make <em>you</em> glow.</h1>
            <p className="hero-copy">A playful, private beauty studio for your undertone, contrast, season, and next favorite look. No rules to memorize. Just a little more evidence for your best instincts.</p>
          </div>
          <div className="hero-note">“The best palette is the one that makes getting ready feel like play.”<small>— your new beauty sidekick</small></div>
        </section>

        <section className="studio-grid" id="studio" aria-label="Photo color studio">
          <div className="glass-card photo-card">
            <div className="panel-heading">
              <div><div className="panel-kicker">01 / your starting point</div><h2 className="panel-title">Bring a well-lit photo</h2></div>
              <div className="panel-meta">{photoName ? `${photoName} · on device` : 'No photo loaded'}<br />daylight is your best filter</div>
            </div>
            <div className="photo-stage">
               <canvas ref={canvasRef} data-testid="canvas-photo" aria-label="Automatically analyzed photo canvas" />
              {!photoUrl && (
                <div className="upload-empty">
                  <div className="upload-empty-inner">
                    <div className="upload-visual"><Palette size={28} strokeWidth={1.4} /></div>
                    <h3>Your face, in full color.</h3>
                    <p>Use a front-facing photo with no filter, direct sunlight, or tinted glasses for a more thoughtful read.</p>
                    <div className="button-row">
                      <button className="button-primary" type="button" onClick={() => fileRef.current?.click()} data-testid="button-upload-photo"><Upload size={15} /> Upload photo</button>
                      <button className="button-secondary" type="button" onClick={() => cameraRef.current?.click()} data-testid="button-take-photo"><Camera size={15} /> Take a photo</button>
                    </div>
                  </div>
                </div>
              )}
               {photoUrl && points.light && points.dark && (
                 <div className="sample-hint"><Sparkles size={13} /><strong>Lightest + darkest spots found automatically</strong></div>
               )}
              {photoUrl && points.light && <span className="canvas-pin light" style={pointStyle(points.light)} aria-label="Light sample point" />}
              {photoUrl && points.dark && <span className="canvas-pin dark" style={pointStyle(points.dark)} aria-label="Dark sample point" />}
            </div>
            <div className="sample-strip">
              <div className="sample-card" data-testid="sample-light">
                <span className="swatch" style={{ background: points.light?.hex ?? 'linear-gradient(135deg,#f9e8ba,#a89bba)' }} />
                <span><span className="sample-label">Lightest spot</span><span className="sample-hex">{points.light?.hex ?? <span className="sample-empty">finding spot…</span>}</span></span>
              </div>
              <div className="sample-card" data-testid="sample-dark">
                <span className="swatch" style={{ background: points.dark?.hex ?? 'linear-gradient(135deg,#2b2445,#111026)' }} />
                <span><span className="sample-label">Darkest spot</span><span className="sample-hex">{points.dark?.hex ?? <span className="sample-empty">finding spot…</span>}</span></span>
              </div>
            </div>
            <input ref={fileRef} className="file-input" type="file" accept="image/*" onChange={(event) => handleFile(event.target.files?.[0])} data-testid="input-upload-photo" />
            <input ref={cameraRef} className="file-input" type="file" accept="image/*" capture="user" onChange={(event) => handleFile(event.target.files?.[0])} data-testid="input-camera-photo" />
            <div className="button-row" style={{ justifyContent: 'space-between', padding: '0 .8rem .85rem' }}>
              <button className="button-quiet" type="button" onClick={resetStudio} data-testid="button-reset-studio"><RotateCcw size={14} /> Reset</button>
              <button className="button-primary" type="button" onClick={runAnalysis} disabled={isAnalyzing || !photoUrl} data-testid="button-run-analysis">{isAnalyzing ? <><RefreshCw className="loading-pulse" size={14} /> Reading your colors</> : <><WandSparkles size={14} /> Read my palette</>}</button>
            </div>
          </div>

          <aside className="glass-card instructions" aria-label="How to use ASTRA">
            <div className="panel-heading"><div><div className="panel-kicker">the ritual</div><h2 className="panel-title">Three tiny clicks.</h2></div><CircleHelp size={18} color="#b59bff" /></div>
            <div className="instruction-list">
              <div className="instruction"><span className="instruction-num">01</span><div><h4>Bring one photo</h4><p>Use a clear, front-facing photo with natural light.</p></div></div>
              <div className="instruction"><span className="instruction-num">02</span><div><h4>Let ASTRA scan</h4><p>The lightest and darkest points are found automatically.</p></div></div>
              <div className="instruction"><span className="instruction-num">03</span><div><h4>Meet your read</h4><p>Reveal undertone, skin tone, face shape, and more one signal at a time.</p></div></div>
            </div>
            <div className="privacy-note"><LockKeyhole size={14} /><span>Your image never leaves this browser. We do not upload, save, or train on your photo.</span></div>
          </aside>
        </section>

        <section className="analysis-section" id="analysis" aria-labelledby="analysis-title">
          <div className="section-header">
            <div><div className="eyebrow"><span className="eyebrow-line" /> 02 / your read</div><h2 id="analysis-title">A little science.<br /><em>One reveal at a time.</em></h2></div>
            <p>Not a box to fit into — follow the signals until your color story comes into focus.</p>
          </div>
          <div className="analysis-grid">
             <div className="season-card">
               {analysis && revealStep >= 5 ? <><div className="panel-kicker">signal 05 · your color season</div><h3>{analysis.season}</h3><p>{analysis.seasonDetail}</p></> : <><div className="panel-kicker">{analysis ? 'signal 05 · coming into focus' : 'your color season'}</div><h3>{analysis ? <>Almost<br />there.</> : <>Waiting<br />for you.</>}</h3><p>{analysis ? 'Keep revealing your read to meet the season your colors are pointing toward.' : 'Upload a photo and let ASTRA find the two anchor points for your read.'}</p></>}
            </div>
            <div className="result-cards">
               <ResultCard revealed={!!analysis && revealStep >= 1} icon={<SunMedium size={15} />} label="01 · undertone" value={analysis?.undertone ?? '—'} detail={analysis ? 'The quiet temperature beneath your surface color.' : 'Your warm / cool signal will live here.'} testId="result-undertone" />
               <ResultCard revealed={!!analysis && revealStep >= 2} icon={<Moon size={15} />} label="02 · skin tone" value={analysis?.skinTone ?? '—'} detail={analysis ? 'A five-point range from light through black.' : 'Your tone range will appear here.'} testId="result-skin-tone" />
               <ResultCard revealed={!!analysis && revealStep >= 3} icon={<Sparkles size={15} />} label="03 · face shape" value={analysis?.faceShape ?? '—'} detail={analysis ? 'A soft proportion cue from your photo.' : 'Your face-shape cue will appear here.'} testId="result-face-shape" />
               <ResultCard revealed={!!analysis && revealStep >= 4} icon={<Gem size={15} />} label="04 · contrast" value={analysis?.contrast ?? '—'} detail={analysis ? 'How much your natural features like definition.' : 'Your light-to-deep relationship will live here.'} testId="result-contrast" />
               <ResultCard revealed={!!analysis && revealStep >= 6} icon={<Gem size={15} />} label="06 · jewelry mood" value={analysis?.jewelry ?? '—'} detail={analysis ? 'Your most natural-looking metal direction.' : 'A little shine direction, coming soon.'} testId="result-jewelry" />
               <ResultCard revealed={!!analysis && revealStep >= 7} icon={<ShieldCheck size={15} />} label="07 · the north star" value={analysis ? 'Start here' : '—'} detail={analysis?.recommendation ?? 'Your most useful styling cue will appear here.'} testId="result-recommendation" />
              <div className="result-card wide" data-testid="result-color-ribbon">
                <span className="result-label">your constellation colors</span>
                 {analysis && revealStep >= 7 ? <div className="color-ribbon">{analysis.colors.map((color) => <i key={color} style={{ background: color }} title={color} />)}</div> : <div className="color-ribbon locked-ribbon"><i style={{ background: '#3B2E65' }} /><i style={{ background: '#5C4B83' }} /><i style={{ background: '#8773A8' }} /><i style={{ background: '#B2A1C4' }} /><i style={{ background: '#D4C7D7' }} /></div>}
              </div>
            </div>
          </div>
          <div className="reveal-controls">
             <div className="reveal-progress" aria-label={`Color read progress: ${revealStep} of ${REVEAL_LABELS.length} signals revealed`}>
               {REVEAL_LABELS.map((label, index) => <span className={index < revealStep ? 'is-revealed' : ''} key={label} title={label} />)}
            </div>
             <button className="button-primary reveal-button" type="button" onClick={revealNext} disabled={!analysis || revealStep >= REVEAL_LABELS.length} data-testid="button-reveal-next">
               <Sparkles size={15} /> {!analysis ? 'Read your photo first' : revealStep >= REVEAL_LABELS.length ? 'Read complete' : `Reveal my ${REVEAL_LABELS[revealStep]}`}
            </button>
          </div>
        </section>

        <section className="guides-section" id="guides" aria-labelledby="guides-title">
          <div className="section-header">
            <div><div className="eyebrow"><span className="eyebrow-line" /> 03 / make it yours</div><h2 id="guides-title">Turn the read<br /><em>into a ritual.</em></h2></div>
            <p>Tell us the mood, hand us your real kit, and get ideas you can actually try tonight.</p>
          </div>
          <div className="guides-layout">
            <div className="glass-card guide-form">
              <div className="panel-kicker">your brief</div>
              <h3 className="panel-title" style={{ marginBottom: '1.2rem' }}>What are we making?</h3>
              <div className="form-field"><label className="form-label" htmlFor="wish">The feeling / occasion</label><textarea id="wish" value={wish} onChange={(event) => setWish(event.target.value)} placeholder="e.g. soft-focus dinner look, bright office makeup, wedding guest glow…" data-testid="textarea-beauty-wish" /><div className="field-help">Specific is fun. “A little mysterious” counts.</div></div>
              <div className="form-field"><label className="form-label" htmlFor="products">Products & tools already in your orbit</label><input id="products" value={products} onChange={(event) => setProducts(event.target.value)} placeholder="e.g. cream blush, flat iron, brown liner" data-testid="input-products-tools" /><div className="field-help">Separate with commas — we will work with what you have.</div></div>
              <button className="button-primary" type="button" onClick={generateGuides} disabled={isGenerating} data-testid="button-generate-guides">{isGenerating ? <><RefreshCw className="loading-pulse" size={15} /> Building your guide</> : <><Sparkles size={15} /> Generate my guide</>}</button>
            </div>
            <div className="guide-results">
              {guides ? <><GuideCard icon={<Paintbrush size={16} />} title="Makeup orbit" chip="face" items={guides.makeup} testId="guide-makeup" /><GuideCard icon={<Scissors size={16} />} title="Hair trajectory" chip="hair" items={guides.hair} testId="guide-hair" /><GuideCard icon={<WandSparkles size={16} />} title="Your tiny kit" chip="tools" items={guides.kit} full testId="guide-kit" /></> : <div className="glass-card guide-empty" style={{ gridColumn: 'span 2' }} data-testid="empty-guides"><WandSparkles size={22} /><p>Your makeup, hair, and tiny-kit ideas will appear here — with less scrolling and more trying things on.</p></div>}
            </div>
          </div>
        </section>

        <footer className="footer"><span>ASTRA studio · a private space for playing with your own color story</span><span>made for the beautifully curious</span></footer>
      </div>
      {toast && <div className="toast-message" role="status" data-testid="status-toast"><Check size={15} /> {toast}</div>}
    </main>
  );
}

function ResultCard({ icon, label, value, detail, revealed, testId }: { icon: ReactNode; label: string; value: string; detail: string; revealed: boolean; testId: string }) {
  return <div className={`result-card ${revealed ? 'is-revealed' : 'is-locked'}`} data-testid={testId}><div className="result-icon">{icon}</div><div className="result-label">{label}</div><div className="result-value">{revealed ? value : '•••'}</div><p className="result-detail">{revealed ? detail : 'A signal is waiting for its moment.'}</p></div>;
}

function GuideCard({ icon, title, chip, items, full = false, testId }: { icon: ReactNode; title: string; chip: string; items: string[]; full?: boolean; testId: string }) {
  return <article className={`guide-card ${full ? 'full' : ''}`} data-testid={testId}><div className="guide-card-head"><div className="guide-card-title">{icon}{title}</div><span className="guide-chip">{chip}</span></div><ul>{items.map((item, index) => <li key={`${testId}-${index}`}>{item}</li>)}</ul></article>;
}

export default App;