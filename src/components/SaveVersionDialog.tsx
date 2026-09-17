import { useEffect, useState } from 'react'
import { Modal } from './Modal'

interface Props {
  open: boolean
  /** Pre-filled label, e.g. the next `vX.Y`. */
  suggestedLabel: string
  onClose: () => void
  onSave: (draft: { label: string; note: string }) => Promise<void>
}

/** Snapshot the current document as a named version. */
export function SaveVersionDialog({ open, suggestedLabel, onClose, onSave }: Props) {
  const [label, setLabel] = useState(suggestedLabel)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  // Fresh fields each time the dialog opens.
  useEffect(() => {
    if (!open) return
    setLabel(suggestedLabel)
    setNote('')
    setSaving(false)
  }, [open, suggestedLabel])

  const submit = async () => {
    if (!label.trim() || saving) return
    setSaving(true)
    try {
      await onSave({ label: label.trim(), note: note.trim() })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      title="Save version"
      description="Freezes the document as it is now. You can restore it from the Versions tab."
      onClose={onClose}
      width="sm"
      footer={
        <>
          <button className="btn-default" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="btn-primary" onClick={submit} disabled={saving || !label.trim()}>
            {saving ? 'Saving…' : 'Save version'}
          </button>
        </>
      }
    >
      <form
        className="flex flex-col gap-md"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <div>
          <label className="label" htmlFor="version-label">
            Label
          </label>
          <input
            id="version-label"
            className="field font-mono"
            data-autofocus
            autoComplete="off"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="version-note">
            What changed? <span className="font-normal text-on-surface-variant">(optional)</span>
          </label>
          <textarea
            id="version-note"
            className="field min-h-[84px] resize-y"
            placeholder="e.g. Tailored bullets for backend roles"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            onKeyDown={(event) => {
              // Ctrl/Cmd+Enter saves from the note field too.
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault()
                void submit()
              }
            }}
          />
        </div>
      </form>
    </Modal>
  )
}
