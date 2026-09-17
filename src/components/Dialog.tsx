import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { Modal } from './Modal'

interface BaseOptions {
  title: string
  body?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  /** Red confirm button, for destructive actions. */
  danger?: boolean
}

export interface ConfirmOptions extends BaseOptions {
  /** The confirm button stays disabled until this exact text is typed. */
  typeToConfirm?: string
}

export interface PromptOptions extends BaseOptions {
  label: string
  defaultValue?: string
  placeholder?: string
  /** Disallow submitting an empty (whitespace-only) value. */
  required?: boolean
}

type Request =
  | { kind: 'confirm'; options: ConfirmOptions; resolve: (ok: boolean) => void }
  | { kind: 'prompt'; options: PromptOptions; resolve: (value: string | null) => void }

interface DialogApi {
  confirm: (options: ConfirmOptions) => Promise<boolean>
  /** Resolves to the entered text, or null when cancelled. */
  prompt: (options: PromptOptions) => Promise<string | null>
}

const DialogContext = createContext<DialogApi | null>(null)

/** In-app replacements for window.confirm / window.prompt, awaited the same way. */
export function DialogProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<Request | null>(null)
  const [value, setValue] = useState('')

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setValue('')
        setRequest({ kind: 'confirm', options, resolve })
      }),
    [],
  )

  const prompt = useCallback(
    (options: PromptOptions) =>
      new Promise<string | null>((resolve) => {
        setValue(options.defaultValue ?? '')
        setRequest({ kind: 'prompt', options, resolve })
      }),
    [],
  )

  // Kept in a ref so the Modal's close handler is stable across keystrokes.
  const current = useRef(request)
  current.current = request

  const cancel = useCallback(() => {
    const active = current.current
    if (!active) return
    setRequest(null)
    if (active.kind === 'confirm') active.resolve(false)
    else active.resolve(null)
  }, [])

  const api = useMemo(() => ({ confirm, prompt }), [confirm, prompt])

  let blocked = false
  if (request?.kind === 'confirm' && request.options.typeToConfirm) {
    blocked = value !== request.options.typeToConfirm
  }
  if (request?.kind === 'prompt' && request.options.required) {
    blocked = !value.trim()
  }

  const submit = () => {
    if (!request || blocked) return
    setRequest(null)
    if (request.kind === 'confirm') request.resolve(true)
    else request.resolve(value)
  }

  const options = request?.options
  const field =
    request?.kind === 'prompt'
      ? { label: request.options.label, placeholder: request.options.placeholder }
      : request?.options.typeToConfirm
        ? { label: `Type ${request.options.typeToConfirm} to confirm`, placeholder: request.options.typeToConfirm }
        : null

  return (
    <DialogContext.Provider value={api}>
      {children}
      <Modal
        open={Boolean(request)}
        title={options?.title ?? ''}
        onClose={cancel}
        width="sm"
        footer={
          <>
            {/* With no text field, focus the safe choice: Cancel for destructive actions. */}
            <button
              className="btn-default"
              onClick={cancel}
              data-autofocus={!field && options?.danger ? true : undefined}
            >
              {options?.cancelLabel ?? 'Cancel'}
            </button>
            <button
              className={options?.danger ? 'btn-danger' : 'btn-primary'}
              onClick={submit}
              disabled={blocked}
              data-autofocus={!field && !options?.danger ? true : undefined}
            >
              {options?.confirmLabel ?? (request?.kind === 'prompt' ? 'Save' : 'Confirm')}
            </button>
          </>
        }
      >
        <form
          className="flex flex-col gap-md"
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          {options?.body && <div className="text-body-md text-on-surface-variant">{options.body}</div>}
          {field && (
            <div>
              <label className="label" htmlFor="dialog-field">
                {field.label}
              </label>
              <input
                id="dialog-field"
                className="field"
                data-autofocus
                autoComplete="off"
                placeholder={field.placeholder}
                value={value}
                onChange={(event) => setValue(event.target.value)}
              />
            </div>
          )}
        </form>
      </Modal>
    </DialogContext.Provider>
  )
}

export function useDialog(): DialogApi {
  const context = useContext(DialogContext)
  if (!context) throw new Error('useDialog must be used inside <DialogProvider>')
  return context
}
