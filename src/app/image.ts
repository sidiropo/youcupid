export default function customImageLoader({ src }: { src: string }) {
  return src.startsWith('/') ? `/youcupid${src}` : src;
} 