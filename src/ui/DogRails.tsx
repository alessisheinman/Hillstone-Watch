import { useEffect, useState } from 'react';

// Every photo in src/assets/dogs is picked up automatically — drop a new JPG in that folder,
// plus a bigger copy with the same name in large/ for the click-to-enlarge view.
const thumbs = import.meta.glob<string>('../assets/dogs/*.jpg', { eager: true, query: '?url', import: 'default' });
const larges = import.meta.glob<string>('../assets/dogs/large/*.jpg', { eager: true, query: '?url', import: 'default' });
const fileName = (path: string) => path.slice(path.lastIndexOf('/') + 1);
const largeByName = new Map(Object.entries(larges).map(([k, url]) => [fileName(k), url]));

export interface DogPhoto { thumb: string; large: string; }
const photos: DogPhoto[] = Object.keys(thumbs).sort().map((k) => ({
  thumb: thumbs[k],
  large: largeByName.get(fileName(k)) ?? thumbs[k],
}));
const left = photos.filter((_, i) => i % 2 === 0);
const right = photos.filter((_, i) => i % 2 === 1);

type Open = (photo: DogPhoto) => void;

/** Decorative photo columns down both sides of the page (hidden below 1200px, where DogStrip shows instead). */
export function DogRails({ onOpen }: { onOpen: Open }) {
  return (
    <>
      <Track className="dog-rail dog-rail-left" photos={left} onOpen={onOpen} />
      <Track className="dog-rail dog-rail-right" photos={right} onOpen={onOpen} />
    </>
  );
}

/** Horizontal photo strip under the top bar for screens too narrow for side columns. */
export function DogStrip({ onOpen }: { onOpen: Open }) {
  return <Track className="dog-strip" photos={photos} onOpen={onOpen} />;
}

function Track({ className, photos, onOpen }: { className: string; photos: DogPhoto[]; onOpen: Open }) {
  // The list is rendered twice so the slow scroll loops seamlessly.
  return (
    <div className={className} aria-hidden="true">
      <div className="dog-track">
        {[...photos, ...photos].map((p, i) => (
          <img key={i} src={p.thumb} alt="" loading="lazy" decoding="async" draggable={false} onClick={() => onOpen(p)} />
        ))}
      </div>
    </div>
  );
}

/** The clicked photo, large and centred. Click anywhere (or press Esc) to put it back. */
export function DogLightbox({ photo, onClose }: { photo: DogPhoto; onClose: () => void }) {
  // Show the already-loaded small copy straight away, then swap in the sharp one once it arrives.
  const [src, setSrc] = useState(photo.thumb);
  useEffect(() => {
    setSrc(photo.thumb);
    const big = new Image();
    big.onload = () => setSrc(photo.large);
    big.src = photo.large;
    return () => { big.onload = null; };
  }, [photo]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="dog-lightbox" role="dialog" aria-label="Dog photo — click to close" onClick={onClose}>
      <div className="dog-lightbox-frame">
        <img src={src} alt="" />
      </div>
    </div>
  );
}
