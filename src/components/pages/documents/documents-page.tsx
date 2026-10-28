"use client";

import { useMemo, useRef, useState } from "react";
import {
  DownloadIcon,
  FileIcon,
  FileImageIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  FolderInputIcon,
  FolderOpenIcon,
  LayoutGridIcon,
  ListIcon,
  MoreHorizontalIcon,
  PencilIcon,
  SearchIcon,
  SearchXIcon,
  StarIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Field } from "@/components/dialogs/field";
import { FilterMenu, type FilterGroup } from "@/components/filter-menu";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatLong, formatShort } from "@/lib/dates";
import type { DocCategory, DocumentFile } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-media-query";
import { useToday } from "@/hooks/use-today";
import { useAppStore } from "@/stores/app-store";
import { EmptyState, PageHeader, PageRoot } from "@/components/pages/shared/page-chrome";

const CATEGORIES: DocCategory[] = ["Contract", "Payslip", "Policy", "Medical", "Tax", "Other"];
const MAX_INLINE_BYTES = 1.5 * 1024 * 1024;

const CATEGORY_COLOR: Record<DocCategory, string | null> = {
  Contract: "purple",
  Payslip: "green",
  Policy: "blue",
  Medical: "pink",
  Tax: "orange",
  Other: null,
};

type Filter = "all" | "starred" | DocCategory;
type Sort = "newest" | "oldest" | "name" | "size";

const SORTS: { value: Sort; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "name", label: "Name" },
  { value: "size", label: "Size" },
];

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function splitName(name: string): [string, string] {
  const i = name.lastIndexOf(".");
  return i > 0 ? [name.slice(0, i), name.slice(i)] : [name, ""];
}

/** Best-guess category from the file name; falls back to the active filter. */
function guessCategory(name: string, fallback: DocCategory): DocCategory {
  const n = name.toLowerCase();
  if (/payslip|pay slip|salary|wage/.test(n)) return "Payslip";
  if (/contract|agreement|offer|nda/.test(n)) return "Contract";
  if (/policy|handbook|guideline/.test(n)) return "Policy";
  if (/medical|certificate|sick|doctor|health/.test(n)) return "Medical";
  if (/tax|p60|p45|p11d|w-?2|1099|invoice/.test(n)) return "Tax";
  return fallback;
}

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function downloadDoc(doc: DocumentFile) {
  if (!doc.dataUrl) {
    toast("This is a demo file", { description: `“${doc.name}” has no content attached — upload your own to download it.` });
    return;
  }
  const a = document.createElement("a");
  a.href = doc.dataUrl;
  a.download = doc.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function DocGlyph({ name, className }: { name: string; className?: string }) {
  const ext = splitName(name)[1].toLowerCase();
  const Icon = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".heic", ".svg"].includes(ext)
    ? FileImageIcon
    : [".xls", ".xlsx", ".csv", ".numbers"].includes(ext)
      ? FileSpreadsheetIcon
      : [".pdf", ".doc", ".docx", ".txt", ".md", ".rtf", ".pages"].includes(ext)
        ? FileTextIcon
        : FileIcon;
  return <Icon className={className} />;
}

function CategoryBadge({ category }: { category: DocCategory }) {
  const c = CATEGORY_COLOR[category];
  return (
    <span
      className="t-12-tight salt inline-flex h-[22px] w-fit items-center rounded-[6px] px-1.5 whitespace-nowrap"
      style={
        c
          ? { background: `var(--category-${c}-tint)`, color: `var(--event-${c}-fg)` }
          : { background: "var(--status-neutral-tint)", color: "var(--status-neutral)" }
      }
    >
      {category}
    </span>
  );
}

export function DocumentsPage() {
  const today = useToday();
  const documents = useAppStore((s) => s.documents);
  const addDocument = useAppStore((s) => s.addDocument);

  const isMobile = useIsMobile();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("newest");
  const [view, setView] = useState<"list" | "grid">("list");
  const [renaming, setRenaming] = useState<DocumentFile | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: documents.length, starred: documents.filter((d) => d.starred).length };
    for (const cat of CATEGORIES) c[cat] = documents.filter((d) => d.category === cat).length;
    return c;
  }, [documents]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = documents.filter(
      (d) =>
        (filter === "all" || (filter === "starred" ? d.starred : d.category === filter)) &&
        (!q || d.name.toLowerCase().includes(q) || d.category.toLowerCase().includes(q)),
    );
    const cmp: Record<Sort, (a: DocumentFile, b: DocumentFile) => number> = {
      newest: (a, b) => b.uploadedAt.localeCompare(a.uploadedAt),
      oldest: (a, b) => a.uploadedAt.localeCompare(b.uploadedAt),
      name: (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }),
      size: (a, b) => b.size - a.size,
    };
    return [...list].sort(cmp[sort]);
  }, [documents, filter, query, sort]);

  const totalSize = useMemo(() => documents.reduce((a, d) => a + d.size, 0), [documents]);

  async function upload(files: FileList | File[]) {
    const list = Array.from(files);
    if (!list.length) return;
    const fallback: DocCategory = filter !== "all" && filter !== "starred" ? filter : "Other";
    let metadataOnly = 0;
    for (const file of list) {
      const category = guessCategory(file.name, fallback);
      let dataUrl: string | undefined;
      if (file.size <= MAX_INLINE_BYTES) {
        try {
          dataUrl = await readAsDataUrl(file);
        } catch {
          dataUrl = undefined;
        }
      }
      if (!dataUrl) metadataOnly += 1;
      addDocument({ name: file.name, category, size: file.size, dataUrl, starred: false });
    }
    toast.success(list.length === 1 ? "Document uploaded" : `${list.length} documents uploaded`, {
      description:
        list.length === 1 ? `${list[0].name} · ${guessCategory(list[0].name, fallback)}` : "Filed by name — move them any time.",
    });
    if (metadataOnly) {
      toast(metadataOnly === 1 ? "Large file saved as details only" : `${metadataOnly} large files saved as details only`, {
        description: "Files over 1.5 MB aren’t stored in this browser demo, so they can’t be downloaded.",
      });
    }
    // Make sure the new uploads are visible.
    setQuery("");
    if (filter === "starred") setFilter("all");
  }

  const hasFilters = query.trim() !== "" || filter !== "all";

  // Phones fold the category tabs and the sort select into one filter sheet.
  const filterGroups: FilterGroup[] = [
    {
      id: "show",
      label: "Show",
      type: "single",
      options: (["all", "starred", ...CATEGORIES] as Filter[]).map((f) => ({
        value: f,
        label: `${f === "all" ? "All" : f === "starred" ? "Starred" : f} · ${counts[f] ?? 0}`,
        adornment: f === "starred" ? <StarIcon className="size-3.5 text-warning" /> : undefined,
      })),
      value: filter,
      onChange: (v) => setFilter(v as Filter),
    },
    {
      id: "sort",
      label: "Sort by",
      type: "single",
      options: SORTS,
      value: sort,
      onChange: (v) => setSort(v as Sort),
    },
  ];
  const activeFilters = Number(filter !== "all") + Number(sort !== "newest");

  return (
    <PageRoot
      className="relative bg-surface"
      // Drag & drop anywhere on the page to upload.
      onDragEnter={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        dragDepth.current += 1;
        setDragging(true);
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) e.preventDefault();
      }}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (!dragDepth.current) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        if (e.dataTransfer.files.length) void upload(e.dataTransfer.files);
      }}
    >
      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) void upload(e.target.files);
          e.target.value = "";
        }}
      />
      <PageHeader
        title="Documents"
        description={`${documents.length} ${documents.length === 1 ? "file" : "files"} · ${formatSize(totalSize)}`}
        actions={
          <Button variant="brand" className="h-9 px-3.5" onClick={() => fileInput.current?.click()}>
            <UploadIcon /> Upload
          </Button>
        }
      />

      {/* Toolbar */}
      <div className="z-10 flex flex-wrap items-center gap-2 border-b border-hairline bg-surface px-4 py-3 max-md:sticky max-md:top-0 max-md:py-2.5">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)} className="min-w-0 max-md:hidden">
          <TabsList className="h-9">
            {(["all", "starred", ...CATEGORIES] as Filter[]).map((f) => (
              <TabsTrigger key={f} value={f} className="t-14 salt h-8 gap-1.5 px-2.5 text-[14px] data-active:text-fg">
                {f === "all" ? "All" : f === "starred" ? <StarIcon className="size-3.5" aria-label="Starred" /> : f}
                {counts[f] ? <span className="t-12 text-placeholder tabular-nums">{counts[f]}</span> : null}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="ml-auto flex items-center gap-2 max-md:ml-0 max-md:w-full">
          <div className="relative max-md:min-w-0 max-md:flex-1">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-icon" />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={isMobile ? "Search" : "Search documents"}
              aria-label="Search documents"
              className="h-9 w-52 pl-8 max-md:h-10 max-md:w-full max-md:text-[16px]"
            />
          </div>
          <Select value={sort} onValueChange={(v) => setSort(v as Sort)}>
            <SelectTrigger className="h-9! w-[124px] max-md:hidden" aria-label="Sort by">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORTS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="md:hidden">
            <FilterMenu
              groups={filterGroups}
              activeCount={activeFilters}
              onReset={() => {
                setFilter("all");
                setSort("newest");
              }}
              className="h-10"
            />
          </div>
          <div className="flex items-center rounded-lg border border-control p-0.5" role="group" aria-label="Layout">
            {(
              [
                ["list", ListIcon, "List view"],
                ["grid", LayoutGridIcon, "Grid view"],
              ] as const
            ).map(([v, Glyph, label]) => (
              <Tooltip key={v}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label={label}
                    aria-pressed={view === v}
                    onClick={() => setView(v)}
                    className={cn(
                      "flex size-9 items-center justify-center rounded-md outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-brand/40 max-md:size-[34px]",
                      view === v ? "bg-selected text-fg" : "text-icon hover-fine:text-fg",
                    )}
                  >
                    <Glyph className="size-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>{label}</TooltipContent>
              </Tooltip>
            ))}
          </div>
        </div>
      </div>

      {documents.length === 0 ? (
        <EmptyState
          className="flex-1"
          icon={<FolderOpenIcon />}
          title="No documents yet"
          hint="Upload contracts, payslips or certificates — or drop files anywhere on this page."
          action={
            <Button variant="brand" onClick={() => fileInput.current?.click()}>
              <UploadIcon /> Upload files
            </Button>
          }
        />
      ) : visible.length === 0 ? (
        <EmptyState
          className="flex-1"
          icon={<SearchXIcon />}
          title={filter === "starred" && !query ? "No starred documents" : "No documents match"}
          hint={
            filter === "starred" && !query
              ? "Star the files you open often to keep them one click away."
              : "Try a different search or category."
          }
          action={
            hasFilters ? (
              <Button
                onClick={() => {
                  setQuery("");
                  setFilter("all");
                }}
              >
                Clear filters
              </Button>
            ) : null
          }
        />
      ) : view === "list" ? (
        <>
          <DocumentTable docs={visible} today={today} onRename={setRenaming} />
          <DocumentList docs={visible} today={today} onRename={setRenaming} />
        </>
      ) : (
        <DocumentGrid docs={visible} today={today} onRename={setRenaming} />
      )}

      {dragging ? (
        <div className="pointer-events-none absolute inset-2 z-20 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-brand bg-surface/90 duration-150 ease-(--ease-out) animate-in fade-in-0">
          <UploadIcon className="size-5 text-brand" />
          <p className="t-14 text-fg">Drop to upload</p>
          <p className="t-12 text-fg-2">Files up to 1.5 MB are stored in this browser</p>
        </div>
      ) : null}

      <RenameDialog doc={renaming} onClose={() => setRenaming(null)} />
    </PageRoot>
  );
}

/* ------------------------------------------------------------------ row pieces */

function uploadedLabel(iso: string, today: string) {
  const day = iso.slice(0, 10);
  if (day === today) return "Today";
  return day.slice(0, 4) === today.slice(0, 4) ? formatShort(day) : formatLong(day);
}

function StarButton({ doc, className }: { doc: DocumentFile; className?: string }) {
  const updateDocument = useAppStore((s) => s.updateDocument);
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={doc.starred ? `Unstar ${doc.name}` : `Star ${doc.name}`}
      aria-pressed={!!doc.starred}
      onClick={(e) => {
        e.stopPropagation();
        updateDocument(doc.id, { starred: !doc.starred });
      }}
      className={cn("size-9", doc.starred && "text-warning hover-fine:text-warning", className)}
    >
      <StarIcon className={cn(doc.starred && "fill-current")} />
    </Button>
  );
}

/** Menu rows grow to 40px on phones. */
const MENU_ITEM = "max-md:min-h-10";

function RowMenu({
  doc,
  onRename,
  className,
}: {
  doc: DocumentFile;
  onRename: (d: DocumentFile) => void;
  className?: string;
}) {
  const updateDocument = useAppStore((s) => s.updateDocument);
  const deleteDocument = useAppStore((s) => s.deleteDocument);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`More actions for ${doc.name}`}
          onClick={(e) => e.stopPropagation()}
          className={cn("size-9", className)}
        >
          <MoreHorizontalIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem className={MENU_ITEM} onSelect={() => downloadDoc(doc)}>
          <DownloadIcon /> Download
        </DropdownMenuItem>
        <DropdownMenuItem className={MENU_ITEM} onSelect={() => onRename(doc)}>
          <PencilIcon /> Rename
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className={cn("t-14 salt gap-1.5 [&_svg]:text-icon", MENU_ITEM)}>
            <FolderInputIcon className="size-3.5" /> Move to
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-40">
            <DropdownMenuRadioGroup
              value={doc.category}
              onValueChange={(v) => {
                updateDocument(doc.id, { category: v as DocCategory });
                toast.success(`Moved to ${v}`, { description: doc.name });
              }}
            >
              {CATEGORIES.map((c) => (
                <DropdownMenuRadioItem key={c} value={c} className={cn("t-14", MENU_ITEM)}>
                  {c}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" className={MENU_ITEM} onSelect={() => deleteDocument(doc.id)}>
          <Trash2Icon /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type ViewProps = { docs: DocumentFile[]; today: string; onRename: (d: DocumentFile) => void };

function DocumentTable({ docs, today, onRename }: ViewProps) {
  return (
    <table className="w-full table-fixed border-collapse max-md:hidden">
      <thead>
        <tr className="h-10 bg-app">
          <th className="t-14 pl-4 text-left font-medium text-fg-2">Name</th>
          <th className="t-14 w-[130px] px-3 text-left font-medium text-fg-2">Category</th>
          <th className="t-14 w-[96px] px-3 text-right font-medium text-fg-2">Size</th>
          <th className="t-14 w-[140px] px-3 text-left font-medium text-fg-2">Uploaded</th>
          <th className="w-[112px] pr-4">
            <span className="sr-only">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {docs.map((d) => (
          <tr
            key={d.id}
            onDoubleClick={() => downloadDoc(d)}
            className="group h-14 border-b border-subtle transition-colors duration-150 hover-fine:bg-hover"
          >
            <td className="pl-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-app text-icon">
                  <DocGlyph name={d.name} className="size-4" />
                </span>
                <span className="t-14 min-w-0 truncate text-table" title={d.name}>
                  {d.name}
                </span>
                {d.starred ? <StarIcon className="size-3 shrink-0 fill-current text-warning" aria-label="Starred" /> : null}
              </div>
            </td>
            <td className="px-3">
              <CategoryBadge category={d.category} />
            </td>
            <td className="t-14 px-3 text-right text-table tabular-nums">{formatSize(d.size)}</td>
            <td className="t-14 px-3 text-table">{uploadedLabel(d.uploadedAt, today)}</td>
            <td className="pr-4">
              <div className="flex items-center justify-end gap-0.5">
                <StarButton doc={d} />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="size-9" aria-label={`Download ${d.name}`} onClick={() => downloadDoc(d)}>
                      <DownloadIcon />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{d.dataUrl ? "Download" : "Demo file"}</TooltipContent>
                </Tooltip>
                <RowMenu doc={d} onRename={onRename} />
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Phones: the table becomes a list — tap a row to open the file, star and menu stay visible. */
function DocumentList({ docs, today, onRename }: ViewProps) {
  return (
    <ul className="divide-y divide-subtle border-b border-subtle md:hidden">
      {docs.map((d) => (
        <li key={d.id} className="flex items-center pr-2">
          <button
            type="button"
            onClick={() => downloadDoc(d)}
            className="flex min-w-0 flex-1 items-center gap-3 py-3 pl-4 text-left outline-none transition-colors duration-150 focus-visible:bg-hover active:bg-hover"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-app text-icon">
              <DocGlyph name={d.name} className="size-4" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span className="t-14 truncate text-table">{d.name}</span>
              <span className="flex min-w-0 items-center gap-2">
                <CategoryBadge category={d.category} />
                <span className="t-12 truncate text-fg-2">
                  {formatSize(d.size)} · {uploadedLabel(d.uploadedAt, today)}
                </span>
              </span>
            </span>
          </button>
          <StarButton doc={d} className="size-10" />
          <RowMenu doc={d} onRename={onRename} className="size-10" />
        </li>
      ))}
    </ul>
  );
}

function DocumentGrid({ docs, today, onRename }: ViewProps) {
  return (
    <ul className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-[repeat(auto-fill,minmax(200px,1fr))]">
      {docs.map((d) => (
        <li
          key={d.id}
          className="group flex flex-col overflow-hidden rounded-xl border border-hairline bg-surface transition-colors duration-150 hover-fine:border-segment"
        >
          <button
            type="button"
            onClick={() => downloadDoc(d)}
            className="flex h-24 items-center justify-center bg-app text-icon outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-inset"
            aria-label={`Download ${d.name}`}
          >
            <DocGlyph name={d.name} className="size-7" />
          </button>
          <div className="flex items-start gap-1 p-3 pr-1.5">
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <span className="t-14 truncate text-fg" title={d.name}>
                {d.name}
              </span>
              <span className="t-12 truncate text-fg-2">
                {formatSize(d.size)} · {uploadedLabel(d.uploadedAt, today)}
              </span>
              <CategoryBadge category={d.category} />
            </div>
            <div className="-mt-1 flex flex-col">
              <StarButton doc={d} className="size-9" />
              <RowMenu doc={d} onRename={onRename} className="size-9" />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ rename */

function RenameDialog({ doc, onClose }: { doc: DocumentFile | null; onClose: () => void }) {
  return (
    <Dialog open={!!doc} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="gap-5 p-5 sm:max-w-[420px]">
        {doc ? <RenameForm key={doc.id} doc={doc} onDone={onClose} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function RenameForm({ doc, onDone }: { doc: DocumentFile; onDone: () => void }) {
  const updateDocument = useAppStore((s) => s.updateDocument);
  const [base, ext] = splitName(doc.name);
  const [value, setValue] = useState(base);
  const trimmed = value.trim();
  const error = !trimmed ? "Give the file a name." : /[\\/:*?"<>|]/.test(trimmed) ? "Avoid \\ / : * ? \" < > |" : null;

  return (
    <form
      className="contents"
      onSubmit={(e) => {
        e.preventDefault();
        if (error) return;
        const name = trimmed + ext;
        if (name !== doc.name) {
          updateDocument(doc.id, { name });
          toast.success("Document renamed", { description: name });
        }
        onDone();
      }}
    >
      <DialogHeader className="gap-1.5">
        <DialogTitle className="t-16">Rename document</DialogTitle>
        <DialogDescription className="t-14">The file type stays the same.</DialogDescription>
      </DialogHeader>
      <Field label="Name" htmlFor="doc-name" error={value !== base ? error : null}>
        <div className="flex items-center gap-2">
          <Input
            id="doc-name"
            value={value}
            autoFocus
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => setValue(e.target.value)}
            aria-invalid={error ? true : undefined}
            className="max-md:h-10 max-md:text-[16px]"
          />
          {ext ? <span className="t-14 shrink-0 text-fg-2">{ext}</span> : null}
        </div>
      </Field>
      {/* On phones the sheet pads for the home indicator; the footer absorbs that padding. */}
      <DialogFooter className="-mx-5 -mb-5 bg-app px-5 py-3 max-sm:mb-[calc(-1*max(1.25rem,env(safe-area-inset-bottom)))] max-sm:pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <Button type="button" onClick={onDone} className="max-sm:h-10">
          Cancel
        </Button>
        <Button type="submit" variant="brand" disabled={!!error} className="max-sm:h-10">
          Rename
        </Button>
      </DialogFooter>
    </form>
  );
}
