'use client';

import { Color } from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import Link from '@tiptap/extension-link';
import TextAlign from '@tiptap/extension-text-align';
import { TextStyle } from '@tiptap/extension-text-style';
import Underline from '@tiptap/extension-underline';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useCallback, type ReactNode } from 'react';

const TEXT_COLORS = ['#0f172a', '#dc2626', '#16a34a', '#2563eb', '#ca8a04', '#7c3aed'];
const HIGHLIGHT_COLORS = ['#fef08a', '#bbf7d0', '#bfdbfe', '#fecaca', '#e9d5ff', 'transparent'];

const extensions = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    bulletList: { HTMLAttributes: { class: 'list-disc pl-5' } },
    orderedList: { HTMLAttributes: { class: 'list-decimal pl-5' } },
  }),
  Underline,
  Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { class: 'text-[#14B8A6] underline' } }),
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
  TextStyle,
  Color,
  Highlight.configure({ multicolor: true }),
];

type Props = {
  value: string;
  onChange: (html: string) => void;
  placeholderTags: string[];
  /** Bump when the drawer opens a different template so the editor remounts with new HTML. */
  remountKey?: string | number;
};

function ToolbarButton({
  active,
  disabled,
  onClick,
  children,
  title,
}: {
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
  title: string;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`rounded px-2 py-1 text-xs font-semibold transition-colors disabled:opacity-40 ${
        active ? 'bg-slate-200 text-slate-900' : 'text-slate-700 hover:bg-slate-100'
      }`}
    >
      {children}
    </button>
  );
}

function EmailTemplateRichEditorInner({ value, onChange, placeholderTags }: Omit<Props, 'remountKey'>) {
  const editor = useEditor(
    {
      immediatelyRender: false,
      extensions,
      content: value || '<p></p>',
      editorProps: {
        attributes: {
          class:
            'prose prose-sm max-w-none min-h-[220px] px-3 py-2 text-sm text-slate-900 focus:outline-none [&_a]:text-[#14B8A6] [&_h1]:text-xl [&_h2]:text-lg [&_h3]:text-base',
        },
      },
      onUpdate: ({ editor: ed }) => {
        onChange(ed.getHTML());
      },
    },
    []
  );

  const insertTag = useCallback(
    (tag: string) => {
      if (!editor) return;
      editor.chain().focus().insertContent(tag).run();
    },
    [editor]
  );

  if (!editor) {
    return <div className="min-h-[240px] rounded-lg border border-slate-200 bg-slate-50" aria-hidden />;
  }

  return (
    <div>
      {placeholderTags.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium text-slate-500">Insert placeholder</span>
          {placeholderTags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => insertTag(tag)}
              className="rounded-md border border-slate-200 bg-white px-2 py-0.5 font-mono text-[10px] leading-tight text-slate-800 shadow-sm hover:border-[#14B8A6] hover:bg-teal-50"
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-200 bg-slate-50/90 px-2 py-1.5">
          <ToolbarButton
            title="Normal text"
            active={editor.isActive('paragraph') && !editor.isActive('heading')}
            onClick={() => editor.chain().focus().setParagraph().run()}
          >
            Normal
          </ToolbarButton>
          <ToolbarButton
            title="Heading 1"
            active={editor.isActive('heading', { level: 1 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          >
            H1
          </ToolbarButton>
          <ToolbarButton
            title="Heading 2"
            active={editor.isActive('heading', { level: 2 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          >
            H2
          </ToolbarButton>
          <ToolbarButton
            title="Heading 3"
            active={editor.isActive('heading', { level: 3 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          >
            H3
          </ToolbarButton>

          <ToolbarButton
            title="Bold"
            active={editor.isActive('bold')}
            onClick={() => editor.chain().focus().toggleBold().run()}
          >
            B
          </ToolbarButton>
          <ToolbarButton
            title="Italic"
            active={editor.isActive('italic')}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          >
            <span className="italic">I</span>
          </ToolbarButton>
          <ToolbarButton
            title="Underline"
            active={editor.isActive('underline')}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
          >
            U
          </ToolbarButton>
          <ToolbarButton
            title="Strikethrough"
            active={editor.isActive('strike')}
            onClick={() => editor.chain().focus().toggleStrike().run()}
          >
            S
          </ToolbarButton>

          <span className="mx-0.5 text-slate-300">|</span>

          {TEXT_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              title={`Text ${c}`}
              className="size-6 rounded border border-slate-200"
              style={{ backgroundColor: c }}
              onClick={() => editor.chain().focus().setColor(c).run()}
            />
          ))}
          <button
            type="button"
            title="Default text color"
            className="rounded border border-slate-200 bg-white px-1 text-[10px] text-slate-600"
            onClick={() => editor.chain().focus().unsetColor().run()}
          >
            Reset
          </button>

          <span className="mx-0.5 text-slate-300">|</span>

          {HIGHLIGHT_COLORS.map((c) => (
            <button
              key={c || 'none'}
              type="button"
              title={c === 'transparent' ? 'Clear highlight' : `Highlight ${c}`}
              className="size-6 rounded border border-slate-200"
              style={{ backgroundColor: c === 'transparent' ? '#fff' : c }}
              onClick={() => {
                if (c === 'transparent') editor.chain().focus().unsetHighlight().run();
                else editor.chain().focus().toggleHighlight({ color: c }).run();
              }}
            />
          ))}

          <span className="mx-0.5 text-slate-300">|</span>

          <ToolbarButton
            title="Align left"
            active={editor.isActive({ textAlign: 'left' })}
            onClick={() => editor.chain().focus().setTextAlign('left').run()}
          >
            L
          </ToolbarButton>
          <ToolbarButton
            title="Align center"
            active={editor.isActive({ textAlign: 'center' })}
            onClick={() => editor.chain().focus().setTextAlign('center').run()}
          >
            C
          </ToolbarButton>
          <ToolbarButton
            title="Align right"
            active={editor.isActive({ textAlign: 'right' })}
            onClick={() => editor.chain().focus().setTextAlign('right').run()}
          >
            R
          </ToolbarButton>
          <ToolbarButton
            title="Justify"
            active={editor.isActive({ textAlign: 'justify' })}
            onClick={() => editor.chain().focus().setTextAlign('justify').run()}
          >
            J
          </ToolbarButton>

          <span className="mx-0.5 text-slate-300">|</span>

          <ToolbarButton
            title="Bullet list"
            active={editor.isActive('bulletList')}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          >
            •
          </ToolbarButton>
          <ToolbarButton
            title="Numbered list"
            active={editor.isActive('orderedList')}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          >
            1.
          </ToolbarButton>

          <span className="mx-0.5 text-slate-300">|</span>

          <ToolbarButton
            title="Link"
            active={editor.isActive('link')}
            onClick={() => {
              const prev = editor.getAttributes('link').href as string | undefined;
              const url = window.prompt('Link URL', prev ?? 'https://');
              if (url === null) return;
              if (url === '') {
                editor.chain().focus().extendMarkRange('link').unsetLink().run();
                return;
              }
              editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
            }}
          >
            Link
          </ToolbarButton>

          <ToolbarButton
            title="Clear formatting"
            onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
          >
            Clear
          </ToolbarButton>
        </div>

        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

export function EmailTemplateRichEditor({ value, onChange, placeholderTags, remountKey }: Props) {
  return (
    <EmailTemplateRichEditorInner
      key={remountKey ?? 'email-template-editor'}
      value={value}
      onChange={onChange}
      placeholderTags={placeholderTags}
    />
  );
}
