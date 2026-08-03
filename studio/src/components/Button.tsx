import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost";

// One button to rule every pane: variants map to the .btn classes in
// tokens.css. type defaults to "button" but a caller can pass type="submit".
export function Button({
  variant = "secondary",
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const cls = className === undefined ? `btn btn-${variant}` : `${className} btn btn-${variant}`;
  return <button type="button" {...rest} className={cls} />;
}
