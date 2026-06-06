import Image from "next/image";
import { clsx } from "clsx";
import { siteConfig } from "@/content/config";

type AdaptiveImageProps = {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  fill?: boolean;
  className?: string;
  sizes?: string;
  priority?: boolean;
};

// Renders next/image in vercel mode (with optimisation) and a plain <img> in static
// mode (GitHub Pages). The parent must have position:relative when fill={true}.
export function AdaptiveImage({
  src,
  alt,
  width,
  height,
  fill = false,
  className,
  sizes,
  priority,
}: AdaptiveImageProps) {
  if (siteConfig.deploymentMode === "vercel") {
    return (
      <Image
        src={src}
        alt={alt}
        width={fill ? undefined : width}
        height={fill ? undefined : height}
        fill={fill}
        className={className}
        sizes={sizes}
        priority={priority}
      />
    );
  }

  // Static mode — plain <img>; apply absolute positioning when fill is requested
  // so the image behaves like next/image fill inside a position:relative parent.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      width={fill ? undefined : width}
      height={fill ? undefined : height}
      className={clsx(fill && "absolute inset-0 h-full w-full", className)}
    />
  );
}
