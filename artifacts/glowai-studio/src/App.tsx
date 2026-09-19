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
type FaceRegion = { x: number; y: number; width: number; height: number };
type RoutinePhoto = { url: string; name: string };
type Analysis = {
  skinTone: string;
  skinType: string;
  undertone: string;
  undertoneTemperature: string;
  blush: string;
  lips: string;
  blushColors: string[];
  lipColors: string[];
  lipShape: string;
  eyeshadow: string;
  eyeshadowColors: string[];
  season: string;
  seasonDetail: string;
  contrast: string;
  jewelry: string;
  faceShape: string;
  haircuts: string[];
  hairColors: string[];
  bestColors: string[];
  forbiddenColors: string[];
  makeupGuide: string[];
  recommendation: string;
  celebrity: string;
  celebrityNote: string;
  colors: string[];
};
type GuideSet = { makeup: string[]; hair: string[]; kit: string[] };
type StarBurst = { id: number; x: number; y: number };

const REVEAL_LABELS = [
  'skin tone',
  'skin type',
  'undertone',
  'contrast',
  'lip shape',
  'lip & blush shades',
  'eyeshadow shades',
  'colour season',
  'best colours',
  'forbidden colours',
  'face shape',
  'haircuts',
  'hair dyes',
];

const INITIAL_GUIDES: GuideSet = {
  makeup: [
    'Cleanse, moisturize, and apply sunscreen. Let each layer settle for 60 seconds before adding makeup.',
    'Match skin tint or foundation to the center of your jaw, then apply a thin layer from the center of the face outward.',
    'Tap concealer only onto redness or shadow, keeping the edges sheer so your natural skin still shows through.',
    'Place blush two fingers away from the nose and blend up toward the temple. Start with one tap, then build slowly.',
    'Sweep the lightest eyeshadow over the lid, press the medium shade into the outer third, and soften the crease with a clean brush.',
    'Line the lips from the cupid’s bow outward, fill the corners first, then tap the lipstick into the center and blur the edge.',
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

function skinTypeFromPoints(light: PhotoPoint, dark: PhotoPoint) {
  const lightness = luminance(light.rgb);
  const contrast = Math.abs(lightness - luminance(dark.rgb));
  const lightChroma = Math.max(...light.rgb) - Math.min(...light.rgb);
  if (lightness > 0.7 && lightChroma < 42) return 'Oily';
  if (contrast > 0.58 || lightChroma > 110) return 'Dry';
  return 'Mixed';
}

function isLikelySkin(r: number, g: number, b: number) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const chroma = max - min;
  const warmSignal = r - b;
  const balancedSkin = r >= g * 0.78 && g >= b * 0.72;
  const notBackground = !(r > 245 && g > 245 && b > 245) && !(chroma < 5 && r < 32);
  return r > 24 && g > 14 && b > 10 && balancedSkin && warmSignal > 3 && notBackground && chroma < 175;
}

function undertoneFromPoints(light: PhotoPoint, dark: PhotoPoint) {
  const red = (light.rgb[0] + dark.rgb[0]) / 2;
  const green = (light.rgb[1] + dark.rgb[1]) / 2;
  const blue = (light.rgb[2] + dark.rgb[2]) / 2;
  const warmSignal = red - blue;
  const oliveSignal = green - blue;
  if (warmSignal > 20 && oliveSignal > 10 && green >= red * 0.9) return 'Olive';
  if (warmSignal > 34) return 'Peach';
  if (warmSignal > 14) return 'Golden';
  if (warmSignal < -26) return 'Blue-pink';
  if (warmSignal < -10) return 'Rosy';
  return 'Neutral';
}

function undertoneTemperatureFromName(undertone: string) {
  if (['Peach', 'Golden'].includes(undertone)) return 'Warm';
  if (['Blue-pink', 'Rosy'].includes(undertone)) return 'Cool';
  return 'Neutral';
}

function lipShapeFromFace(faceShape: string, light: PhotoPoint, dark: PhotoPoint) {
  const verticalSpread = Math.abs(light.y - dark.y);
  if (faceShape === 'Heart') return 'Defined cupid’s bow with a softly fuller lower lip';
  if (faceShape === 'Round') return 'Balanced lips with a softly rounded outline';
  if (faceShape === 'Square') return 'Defined, even lip line with a gently broad shape';
  if (verticalSpread > 300) return 'Balanced lips with a subtle cupid’s bow';
  return 'Softly rounded lips with a fuller center';
}

function makeupGuideFor(
  undertone: string,
  undertoneTemperature: string,
  blush: string,
  lips: string,
  eyeshadow: string,
) {
  const baseDirection = undertoneTemperature === 'Warm'
    ? 'Choose a base labeled golden, warm, or olive rather than pink.'
    : undertoneTemperature === 'Cool'
      ? 'Choose a base labeled cool, rosy, or neutral rather than yellow.'
      : 'Choose a neutral base and compare it against your jaw in daylight before buying.';
  return [
    `Prep: cleanse, moisturize, and apply SPF. Wait 60 seconds, then use a pea-sized amount of primer only where makeup usually separates.`,
    `Base: ${baseDirection} Dot a thin layer from the center of your face outward, then press it in with a damp sponge; stop at the jaw instead of dragging product onto the neck.`,
    `Conceal: use a shade that matches your skin, not a very light shade. Tap it under the inner half of the eyes and over redness, then leave the outer edges almost bare.`,
    `Blush: use ${blush.toLowerCase()}. Smile once to find the cheek, place two small dots there, and blend up and back toward the temple with a clean brush.`,
    `Eyes: use ${eyeshadow.toLowerCase()}. Sweep the lightest shade from lash line to brow bone, press the medium shade into the crease, then place the deepest shade only on the outer third.`,
    `Liner and mascara: keep liner thin at the inner corner and slightly thicker at the outer corner. Curl lashes, then apply one coat from root to tip and comb away clumps.`,
    `Lips: start with ${lips.toLowerCase()}. Trace the cupid’s bow and lower center first, connect the corners, fill in the outline, then tap lipstick into the center for a soft edge.`,
    `Final check: step into daylight, soften any hard edges with a clean brush, and add a small amount of setting powder only around the nose and center of the forehead.`,
  ];
}

function celebrityMatch(faceShape: string, season: string) {
  const matches: Record<string, { name: string; note: string }> = {
    Oval: { name: 'Zendaya', note: 'clean lines, luminous skin, and one confident color moment' },
    Round: { name: 'Selena Gomez', note: 'softly sculpted glow with blended edges and playful shine' },
    Heart: { name: 'Rihanna', note: 'graphic color placement balanced with a relaxed, radiant finish' },
    Square: { name: 'Keira Knightley', note: 'defined structure softened by satin textures and warm dimension' },
    Oblong: { name: 'Lupita Nyong’o', note: 'clear color, expressive eyes, and high-impact luminosity' },
  };
  const match = matches[faceShape] ?? matches.Oval;
  return { name: match.name, note: `${match.note} · ${season} energy` };
}

type FaceDetectorResult = { boundingBox: { x: number; y: number; width: number; height: number } };
type FaceDetectorLike = new (options?: { fastMode?: boolean; maxDetectedFaces?: number }) => {
  detect(source: CanvasImageSource): Promise<FaceDetectorResult[]>;
};

async function findFaceRegion(
  image: HTMLImageElement,
  imageX: number,
  imageY: number,
  drawnWidth: number,
  drawnHeight: number,
): Promise<FaceRegion> {
  const faceDetector = (window as typeof window & { FaceDetector?: FaceDetectorLike }).FaceDetector;
  if (faceDetector) {
    try {
      const detectedFaces = await new faceDetector({ fastMode: true, maxDetectedFaces: 1 }).detect(image);
      const box = detectedFaces[0]?.boundingBox;
      if (box) {
        return {
          x: imageX + (box.x / image.naturalWidth) * drawnWidth,
          y: imageY + (box.y / image.naturalHeight) * drawnHeight,
          width: (box.width / image.naturalWidth) * drawnWidth,
          height: (box.height / image.naturalHeight) * drawnHeight,
        };
      }
    } catch {
      // Use the centered portrait zone when the browser has no face detector.
    }
  }
  return {
    x: imageX + drawnWidth * 0.2,
    y: imageY + drawnHeight * 0.08,
    width: drawnWidth * 0.6,
    height: drawnHeight * 0.7,
  };
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
  // Sample only cheek, forehead, and jaw zones. These zones avoid the eyes,
  // eyebrows, lips, nostrils, hairline, ears, clothing, and the background.
  const skinZones = [
    { left: 0.29, top: 0.12, width: 0.42, height: 0.16 }, // forehead center
    { left: 0.12, top: 0.38, width: 0.27, height: 0.26 }, // left cheek
    { left: 0.61, top: 0.38, width: 0.27, height: 0.26 }, // right cheek
    { left: 0.28, top: 0.72, width: 0.44, height: 0.14 }, // jaw center
  ];

  for (const zone of skinZones) {
    const startX = Math.floor(regionX + width * zone.left);
    const endX = Math.floor(regionX + width * (zone.left + zone.width));
    const startY = Math.floor(regionY + height * zone.top);
    const endY = Math.floor(regionY + height * (zone.top + zone.height));
    for (let y = startY; y < endY; y += 6) {
      for (let x = startX; x < endX; x += 6) {
      const offset = ((y - regionY) * width + (x - regionX)) * 4;
      const r = pixels[offset];
      const g = pixels[offset + 1];
      const b = pixels[offset + 2];
      if (!isLikelySkin(r, g, b)) continue;
      const rgb: [number, number, number] = [r, g, b];
      const value = luminance(rgb);
      const point = { x, y, rgb, hex: hexFromRgb(r, g, b) };
      if (!lightCandidate || value > lightCandidate.score) lightCandidate = { score: value, point };
      if (!darkCandidate || value < darkCandidate.score) darkCandidate = { score: value, point };
      }
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
  const undertone = undertoneFromPoints(light, dark);
  const undertoneTemperature = undertoneTemperatureFromName(undertone);
  const warmUndertone = ['Peach', 'Olive', 'Golden'].includes(undertone);
  const coolUndertone = ['Blue-pink', 'Rosy'].includes(undertone);
  const highContrast = contrastScore > 42;
  const skinTone = skinToneFromLightness(lightness);
  const skinType = skinTypeFromPoints(light, dark);
  const faceShape = faceShapeFromPoints(light, dark);
  const season = warmUndertone
    ? (highContrast ? 'Bright Spring' : 'Neutral Autumn')
    : coolUndertone
      ? (highContrast ? 'Bright Winter' : 'Cool Summer')
      : (highContrast ? 'Deep Winter' : 'Soft Summer');
  const blush = warmUndertone
    ? 'Apricot, peach, and warm terracotta'
    : coolUndertone
      ? 'Rose, raspberry, and cool berry'
      : 'Dusty rose, mauve, and soft coral';
  const lips = warmUndertone
    ? 'Honey nude, cinnamon rose, and brick'
    : coolUndertone
      ? 'Pink nude, cranberry, and plum'
      : 'Rosewood, neutral pink, and soft berry';
  const blushColors = warmUndertone
    ? ['#F5B08A', '#D97863', '#B9554D']
    : coolUndertone
      ? ['#E9A1B5', '#C96D91', '#8E466D']
      : ['#DFA19C', '#B97583', '#A76570'];
  const lipColors = warmUndertone
    ? ['#C98667', '#A9544D', '#7F3736']
    : coolUndertone
      ? ['#D486A2', '#A4496D', '#632F59']
      : ['#B97877', '#8D4F61', '#713C52'];
  const eyeshadow = warmUndertone
    ? 'Champagne, bronze, warm cocoa, and olive'
    : coolUndertone
      ? 'Pearl, taupe, rose-mauve, and plum'
      : 'Soft beige, mushroom taupe, rose brown, and cocoa';
  const eyeshadowColors = warmUndertone
    ? ['#F2D2A1', '#B9825C', '#765044', '#7B8155']
    : coolUndertone
      ? ['#E9E3E4', '#9B8D92', '#A9758F', '#5E486B']
      : ['#D8C7B8', '#9D8C83', '#866E6C', '#584B4D'];
  const haircutsByShape: Record<string, string[]> = {
    Oval: ['Chin-length bob with curtain bangs', 'Soft wolf cut to the chin', 'Long layers with a face-framing bend'],
    Round: ['Collarbone lob with airy curtain bangs', 'Chin-length wolf cut with lifted crown', 'Long, tapered layers below the cheekbones'],
    Heart: ['Textured bob with side-swept fringe', 'Chin-length wolf cut with soft ends', 'Long layers with curtain bangs'],
    Square: ['Rounded bob with cheekbone fringe', 'Soft wolf cut to chin length', 'Long layers with curved ends'],
    Oblong: ['Chin-length bob with full curtain bangs', 'Rounded wolf cut with airy volume', 'Collarbone layers with a soft wave'],
  };
  const haircuts = haircutsByShape[faceShape] ?? haircutsByShape.Oval;
  const hairColors = warmUndertone
    ? ['Honey brown', 'Copper gloss', 'Warm espresso']
    : coolUndertone
      ? ['Mushroom brown', 'Blue-black', 'Plum espresso']
      : ['Neutral chocolate', 'Soft black', 'Rose brown'];
  const bestColors = warmUndertone
    ? ['#F6C36A', '#D98270', '#9E5872', '#293A67', '#F4E4C1']
    : coolUndertone
      ? ['#A7C9F2', '#CE8BB8', '#5A518F', '#304C68', '#E7D8F2']
      : ['#D8B6A4', '#A98AC2', '#7589B5', '#D8C579', '#EFE3DB'];
  const forbiddenColors = warmUndertone
    ? ['Icy blue', 'blue-violet', 'cool gray', 'stark optic white']
    : coolUndertone
      ? ['Neon orange', 'yellow-beige', 'yellow-green', 'muddy camel']
      : ['Very neon brights', 'extreme orange', 'blue-based fuchsia', 'flat gray'];
  const lipShape = lipShapeFromFace(faceShape, light, dark);
  const makeupGuide = makeupGuideFor(undertone, undertoneTemperature, blush, lips, eyeshadow);
  const celebrity = celebrityMatch(faceShape, season);
  return {
    skinTone,
    skinType,
    undertone,
    undertoneTemperature,
    blush,
    lips,
    blushColors,
    lipColors,
    lipShape,
    eyeshadow,
    eyeshadowColors,
    season,
    seasonDetail: highContrast
      ? 'Your features hold their shape next to bright, saturated color.'
      : 'Your features glow beside blended, softly layered color.',
    contrast: highContrast ? `High contrast · ${contrastScore}%` : `Gentle contrast · ${contrastScore}%`,
    jewelry: warmUndertone ? 'Gold' : coolUndertone ? 'Silver' : 'Mixed metals',
    faceShape,
    haircuts,
    hairColors,
    bestColors,
    forbiddenColors,
    makeupGuide,
    recommendation: highContrast
      ? 'Choose one clear focal color and let the rest of your look stay quietly luminous.'
      : 'Build tone-on-tone looks with a little sparkle at the center of the face.',
    celebrity: celebrity.name,
    celebrityNote: celebrity.note,
    colors: bestColors,
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
  const routinePhotoRef = useRef<HTMLInputElement>(null);
  const [photoUrl, setPhotoUrl] = useState('');
  const [photoName, setPhotoName] = useState('');
  const [points, setPoints] = useState<Record<SampleKind, PhotoPoint | null>>({ light: null, dark: null });
  const [faceRegion, setFaceRegion] = useState<FaceRegion | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [guides, setGuides] = useState<GuideSet | null>(null);
  const [wish, setWish] = useState('');
  const [products, setProducts] = useState('');
  const [routinePhotos, setRoutinePhotos] = useState<RoutinePhoto[]>([]);
  const routinePhotosRef = useRef<RoutinePhoto[]>([]);
  const [toast, setToast] = useState('');
  const [revealStep, setRevealStep] = useState(0);
  const [bursts, setBursts] = useState<StarBurst[]>([]);
  const burstId = useRef(0);

  useEffect(() => {
    routinePhotosRef.current = routinePhotos;
  }, [routinePhotos]);

  useEffect(() => () => {
    routinePhotosRef.current.forEach(({ url }) => URL.revokeObjectURL(url));
  }, []);

  const drawImage = (url: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const image = new window.Image();
    image.onload = async () => {
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
      const detectedFaceRegion = await findFaceRegion(image, imageX, imageY, width, height);
      const automaticPoints = detectAutomaticPoints(context, detectedFaceRegion);
      setFaceRegion(detectedFaceRegion);
      setPoints(automaticPoints);
       setToast('Skin-only face scan complete. Hair, clothing, eyes, and lips were excluded from the sample zones.');
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
    setFaceRegion(null);
    setAnalysis(null);
    setGuides(null);
    setRevealStep(0);
    setToast('Photo loaded. Finding the lightest and darkest spots.');
  };

  const runAnalysis = () => {
    if (!points.light || !points.dark) {
      setToast('Wait for the face-only scan to finish before reading your palette.');
      return;
    }
    setIsAnalyzing(true);
    window.setTimeout(() => {
      setAnalysis(makeAnalysis(points.light as PhotoPoint, points.dark as PhotoPoint));
      setRevealStep(0);
      setIsAnalyzing(false);
       setToast('Your read is ready. Reveal all 13 signals together.');
      window.setTimeout(() => document.getElementById('analysis')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    }, 480);
  };

  const resetStudio = () => {
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    setPhotoUrl('');
    setPhotoName('');
    setPoints({ light: null, dark: null });
    setFaceRegion(null);
    setAnalysis(null);
    setGuides(null);
    routinePhotos.forEach(({ url }) => URL.revokeObjectURL(url));
    setRoutinePhotos([]);
    setRevealStep(0);
    setToast('Studio reset. Whenever you are ready.');
  };

  const handleRoutineFiles = (files?: FileList | null) => {
    const selected = Array.from(files ?? []).filter((file) => file.type.startsWith('image/'));
    if (!selected.length) {
      setToast('Choose one or more image files for your routine.');
      return;
    }
    setRoutinePhotos((current) => [
      ...current,
      ...selected.map((file) => ({ url: URL.createObjectURL(file), name: file.name })),
    ]);
    setToast(`${selected.length} routine photo${selected.length === 1 ? '' : 's'} added.`);
  };

  const removeRoutinePhoto = (url: string) => {
    URL.revokeObjectURL(url);
    setRoutinePhotos((current) => current.filter((photo) => photo.url !== url));
  };

  const revealAll = () => {
    if (!analysis || revealStep >= REVEAL_LABELS.length) return;
    setRevealStep(REVEAL_LABELS.length);
    setToast('All of your results are revealed together.');
  };

  const generateGuides = () => {
    setIsGenerating(true);
    window.setTimeout(() => {
      const focus = wish.trim() || 'a polished everyday look';
      const kit = products.split(',').map((item) => item.trim()).filter(Boolean);
      setGuides({
        makeup: (analysis?.makeupGuide ?? INITIAL_GUIDES.makeup).map((step, index) => `Step ${index + 1} · ${step}`),
        hair: [
          analysis ? `Try ${analysis.haircuts[0]} first, then keep the silhouette touchable.` : 'Keep the silhouette touchable: a soft bend or airy lift lets your personal color story lead.',
          analysis ? `Two more directions: ${analysis.haircuts[1]} or ${analysis.haircuts[2]}.` : 'Ask for a brighter face frame with a deeper root for beautiful dimension.',
          analysis ? `Best colour directions: ${analysis.hairColors.join(', ')}.` : 'A satin or pearl finish will catch the same light as your new makeup palette.',
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
  const faceRegionStyle = (region: FaceRegion | null) => region
    ? { left: `${region.x / 9}%`, top: `${region.y / 6.2}%`, width: `${region.width / 9}%`, height: `${region.height / 6.2}%` }
    : undefined;
  const allRevealed = !!analysis && revealStep >= REVEAL_LABELS.length;

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
                {photoUrl && faceRegion && <span className="face-scan-zone" style={faceRegionStyle(faceRegion)}><span>skin-only face zones</span></span>}
               {photoUrl && points.light && points.dark && (
                  <div className="sample-hint"><Sparkles size={13} /><strong>Lightest + darkest skin spots found in the face zones</strong></div>
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
               <button className="button-primary" type="button" onClick={runAnalysis} disabled={isAnalyzing || !photoUrl || !points.light || !points.dark} data-testid="button-run-analysis">{isAnalyzing ? <><RefreshCw className="loading-pulse" size={14} /> Reading your colors</> : <><WandSparkles size={14} /> Read my palette</>}</button>
            </div>
          </div>

          <aside className="glass-card instructions" aria-label="How to use ASTRA">
             <div className="panel-heading"><div><div className="panel-kicker">the ritual</div><h2 className="panel-title">One photo. No guesswork.</h2></div><CircleHelp size={18} color="#b59bff" /></div>
            <div className="instruction-list">
              <div className="instruction"><span className="instruction-num">01</span><div><h4>Bring one photo</h4><p>Use a clear, front-facing photo with natural light.</p></div></div>
                <div className="instruction"><span className="instruction-num">02</span><div><h4>Let ASTRA scan skin zones</h4><p>Only forehead, cheek, and jaw skin zones are sampled; hair, clothes, eyes, brows, and lips are excluded.</p></div></div>
                <div className="instruction"><span className="instruction-num">03</span><div><h4>Meet your read</h4><p>Reveal all thirteen results together, from skin tone through hair dyes.</p></div></div>
            </div>
            <div className="privacy-note"><LockKeyhole size={14} /><span>Your image never leaves this browser. We do not upload, save, or train on your photo.</span></div>
          </aside>
        </section>

        <section className="analysis-section" id="analysis" aria-labelledby="analysis-title">
          <div className="section-header">
             <div><div className="eyebrow"><span className="eyebrow-line" /> 02 / your read</div><h2 id="analysis-title">A little science.<br /><em>One reveal, all at once.</em></h2></div>
             <p>Not a box to fit into — see every signal together, then use the guide to turn your color story into a routine.</p>
          </div>
           <div className="reveal-controls reveal-controls-top">
             <div className="reveal-progress" aria-label={`Color read progress: ${revealStep} of ${REVEAL_LABELS.length} signals revealed`}>
               {REVEAL_LABELS.map((label, index) => <span className={index < revealStep ? 'is-revealed' : ''} key={label} title={label} />)}
             </div>
              <button className="button-primary reveal-button" type="button" onClick={revealAll} disabled={!analysis || allRevealed} data-testid="button-reveal-all">
                <Sparkles size={15} /> {!analysis ? 'Read your photo first' : allRevealed ? 'All results revealed' : 'Reveal all results'}
             </button>
           </div>
          <div className="analysis-grid">
            <div className="result-cards">
                 <ResultCard revealed={allRevealed} icon={<SunMedium size={15} />} label="01 · skin tone" value={analysis?.skinTone ?? '—'} detail={analysis ? 'Skin tone estimated from the protected face skin zones only.' : 'Your face-only skin-tone result will live here.'} testId="result-skin-tone" />
                 <ResultCard revealed={allRevealed} icon={<Moon size={15} />} label="02 · skin type" value={analysis?.skinType ?? '—'} detail={analysis ? 'A visual finish cue: dry, oily, or mixed.' : 'Your skin-type cue will appear here.'} testId="result-skin-type" />
                  <ResultCard revealed={allRevealed} icon={<Sparkles size={15} />} label="03 · undertone" value={analysis ? `${analysis.undertone} · ${analysis.undertoneTemperature}` : '—'} detail={analysis ? `Your undertone reads ${analysis.undertoneTemperature.toLowerCase()} — ${analysis.undertone.toLowerCase()} is the specific color signal.` : 'Your undertone and warm/cool direction will appear here.'} testId="result-undertone" />
                 <ResultCard revealed={allRevealed} icon={<ShieldCheck size={15} />} label="04 · contrast" value={analysis?.contrast ?? '—'} detail={analysis ? 'How much your natural features like definition next to color.' : 'Your light-to-deep relationship will live here.'} testId="result-contrast" />
                  <ResultCard revealed={allRevealed} icon={<Gem size={15} />} label="05 · lip shape" value={analysis?.lipShape ?? '—'} detail={analysis ? 'Use the shape as a placement guide, not a rule.' : 'Your lip-shape cue will appear here.'} testId="result-lip-shape" />
                 <ShadeResultCard analysis={analysis} revealed={allRevealed} />
                <EyeshadowResultCard analysis={analysis} revealed={allRevealed} />
                <ResultCard revealed={allRevealed} icon={<Palette size={15} />} label="08 · colour season" value={analysis?.season ?? '—'} detail={analysis?.seasonDetail ?? 'Your colour season will appear here.'} testId="result-colour-season" />
                <PaletteResultCard analysis={analysis} revealed={allRevealed} label="09 · best colours" colors={analysis?.bestColors ?? []} testId="result-best-colours" />
                <PaletteResultCard analysis={analysis} revealed={allRevealed} label="10 · forbidden colours" colors={analysis?.forbiddenColors ?? []} testId="result-forbidden-colours" forbidden />
                <ResultCard revealed={allRevealed} icon={<Sparkles size={15} />} label="11 · face shape" value={analysis?.faceShape ?? '—'} detail={analysis ? 'A soft proportion cue from the face-only scan.' : 'Your face-shape cue will appear here.'} testId="result-face-shape" />
                <ResultCard revealed={allRevealed} icon={<Scissors size={15} />} label="12 · haircuts" value={analysis ? 'Three tailored cuts' : '—'} detail={analysis ? analysis.haircuts.join(' · ') : 'Your three best haircut directions will appear here.'} testId="result-haircuts" />
                <ResultCard revealed={allRevealed} icon={<WandSparkles size={15} />} label="13 · hair dyes" value={analysis ? analysis.hairColors.join(' · ') : '—'} detail={analysis ? 'Hair-colour directions that stay in harmony with your palette.' : 'Your best hair-dye directions will appear here.'} testId="result-hair-colors" />
            </div>
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
               <div className="form-field">
                  <span className="form-label">Inspo photos</span>
                 <input ref={routinePhotoRef} className="file-input" type="file" accept="image/*" multiple onChange={(event) => handleRoutineFiles(event.target.files)} data-testid="input-routine-photos" />
                  <button className="button-secondary routine-upload" type="button" onClick={() => routinePhotoRef.current?.click()}><Upload size={15} /> Inspo upload</button>
                 <div className="field-help">Optional — add your current makeup looks so the guide can work from your real routine.</div>
                 {routinePhotos.length > 0 && <div className="routine-photo-grid">{routinePhotos.map((photo) => <div className="routine-photo" key={photo.url}><img src={photo.url} alt={photo.name} /><button type="button" onClick={() => removeRoutinePhoto(photo.url)} aria-label={`Remove ${photo.name}`}>×</button></div>)}</div>}
               </div>
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

function ShadeBoard({ analysis, revealed }: { analysis: Analysis | null; revealed: boolean }) {
  return (
    <div className={`result-card wide shade-board ${revealed ? 'is-revealed' : 'is-locked'}`} data-testid="result-shade-board" role="img" aria-label="Generated blush and lip shade board">
      <div className="shade-board-head">
        <span className="result-label">generated shade board</span>
        <span className="guide-chip">blush + lips</span>
      </div>
      {revealed && analysis ? (
        <div className="shade-board-layout">
          <div className="shade-board-copy">
            <strong>Colours that suit you</strong>
            <p>Blush: {analysis.blush}</p>
            <p>Lips: {analysis.lips}</p>
          </div>
          <div className="shade-board-swatches">
            <div><span>blush</span>{analysis.blushColors.map((color) => <i key={color} style={{ background: color }} title={color} />)}</div>
            <div><span>lips</span>{analysis.lipColors.map((color) => <i key={color} style={{ background: color }} title={color} />)}</div>
          </div>
        </div>
      ) : (
        <div className="shade-board-locked">Reveal signal 04 to generate your blush + lip image.</div>
      )}
    </div>
  );
}

function ShadeResultCard({ analysis, revealed }: { analysis: Analysis | null; revealed: boolean }) {
  return (
    <div className={`result-card wide shade-result ${revealed ? 'is-revealed' : 'is-locked'}`} data-testid="result-blush-lips">
      <div className="result-icon"><Gem size={15} /></div>
      <div className="result-label">06 · lip & blush shades</div>
      {revealed && analysis ? (
        <div className="shade-result-columns">
          <div className="shade-result-group">
            <span className="shade-result-name">Blush</span>
            <strong>{analysis.blush}</strong>
            <div className="shade-result-swatches">{analysis.blushColors.map((color) => <i key={color} style={{ background: color }} title={color} />)}</div>
          </div>
          <div className="shade-result-group">
            <span className="shade-result-name">Lips</span>
            <strong>{analysis.lips}</strong>
            <div className="shade-result-swatches">{analysis.lipColors.map((color) => <i key={color} style={{ background: color }} title={color} />)}</div>
          </div>
        </div>
      ) : (
        <div className="result-value">•••</div>
      )}
      {!revealed && <p className="result-detail">A signal is waiting for its moment.</p>}
    </div>
  );
}

function EyeshadowResultCard({ analysis, revealed }: { analysis: Analysis | null; revealed: boolean }) {
  return (
    <div className={`result-card wide shade-result ${revealed ? 'is-revealed' : 'is-locked'}`} data-testid="result-eyeshadow-shades">
      <div className="result-icon"><Moon size={15} /></div>
      <div className="result-label">07 · eyeshadow shades</div>
      {revealed && analysis ? (
        <div className="shade-result-columns">
          <div className="shade-result-group">
            <span className="shade-result-name">Best eyeshadow family</span>
            <strong>{analysis.eyeshadow}</strong>
          </div>
          <div className="shade-result-swatches">
            {analysis.eyeshadowColors.map((color) => <i key={color} style={{ background: color }} title={color} />)}
          </div>
        </div>
      ) : (
        <div className="result-value">•••</div>
      )}
      {!revealed && <p className="result-detail">A signal is waiting for its moment.</p>}
    </div>
  );
}

function PaletteResultCard({
  analysis,
  revealed,
  label,
  colors,
  testId,
  forbidden = false,
}: {
  analysis: Analysis | null;
  revealed: boolean;
  label: string;
  colors: string[];
  testId: string;
  forbidden?: boolean;
}) {
  return (
    <div className={`result-card wide shade-result ${revealed ? 'is-revealed' : 'is-locked'}`} data-testid={testId}>
      <div className="result-icon">{forbidden ? <ShieldCheck size={15} /> : <Palette size={15} />}</div>
      <div className="result-label">{label}</div>
      {revealed && analysis ? (
        <div className="shade-result-columns">
          <div className="shade-result-group">
            <span className="shade-result-name">{forbidden ? 'Use sparingly or keep away from the face' : 'Start with these shades'}</span>
            <strong>{colors.join(', ')}</strong>
          </div>
          <div className="shade-result-swatches">
            {colors.map((color) => <i key={color} className={forbidden ? 'forbidden-swatch' : ''} title={color} style={{ background: color.startsWith('#') ? color : '#463C5D' }} />)}
          </div>
        </div>
      ) : (
        <div className="result-value">•••</div>
      )}
      {!revealed && <p className="result-detail">A signal is waiting for its moment.</p>}
    </div>
  );
}

function ResultCard({ icon, label, value, detail, revealed, testId }: { icon: ReactNode; label: string; value: string; detail: string; revealed: boolean; testId: string }) {
  return <div className={`result-card ${revealed ? 'is-revealed' : 'is-locked'}`} data-testid={testId}><div className="result-icon">{icon}</div><div className="result-label">{label}</div><div className="result-value">{revealed ? value : '•••'}</div><p className="result-detail">{revealed ? detail : 'A signal is waiting for its moment.'}</p></div>;
}

function GuideCard({ icon, title, chip, items, full = false, testId }: { icon: ReactNode; title: string; chip: string; items: string[]; full?: boolean; testId: string }) {
  return <article className={`guide-card ${full ? 'full' : ''}`} data-testid={testId}><div className="guide-card-head"><div className="guide-card-title">{icon}{title}</div><span className="guide-chip">{chip}</span></div><ul>{items.map((item, index) => <li key={`${testId}-${index}`}>{item}</li>)}</ul></article>;
}

export default App;