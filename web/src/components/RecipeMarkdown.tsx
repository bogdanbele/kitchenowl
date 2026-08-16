import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Photo } from "./Photo";

/**
 * The recipe method, rendered — used for both the read view and the editor's
 * preview, so an image embedded in a step renders the same in both places.
 *
 * A plain `<img src>` cannot load an uploaded photo: `/upload/<filename>`
 * needs the bearer token, same reason `Photo` exists at all. react-markdown's
 * default `img` renderer knows nothing of that, so it is swapped for `Photo`
 * here rather than in each caller.
 */
export function RecipeMarkdown({ children }: { children: string }) {
  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      components={{
        img: ({ src, alt }) => (
          <Photo photo={typeof src === "string" ? src : null} alt={alt ?? ""} className="rounded-card" />
        ),
      }}
    >
      {children}
    </Markdown>
  );
}
