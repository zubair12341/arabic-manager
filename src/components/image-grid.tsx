import { useEffect, useState } from "react";
import { signedUrls } from "@/lib/upload";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { FileText } from "lucide-react";

export function ImageGrid({ bucket, paths }: { bucket: "purchase-images" | "payment-images"; paths: string[] }) {
  const [urls, setUrls] = useState<string[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  useEffect(() => { signedUrls(bucket, paths).then(setUrls).catch(() => setUrls([])); }, [bucket, paths.join(",")]);
  if (!paths.length) return <div className="text-xs text-muted-foreground">No attachments</div>;
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {paths.map((p, i) => {
          const url = urls[i];
          const isPdf = p.toLowerCase().endsWith(".pdf");
          return (
            <button key={p} type="button" onClick={() => setOpen(i)}
              className="h-16 w-16 rounded border bg-muted overflow-hidden grid place-items-center hover:opacity-80">
              {isPdf || !url ? <FileText className="h-6 w-6 text-muted-foreground" /> :
                <img src={url} alt="attachment" className="h-full w-full object-cover" />}
            </button>
          );
        })}
      </div>
      <Dialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-w-3xl">
          {open !== null && urls[open] && (
            paths[open].toLowerCase().endsWith(".pdf") ? (
              <iframe src={urls[open]} className="w-full h-[70vh]" title="attachment" />
            ) : (
              <img src={urls[open]} alt="preview" className="w-full max-h-[80vh] object-contain" />
            )
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
