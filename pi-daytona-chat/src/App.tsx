import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useAction, useMutation, useQuery } from 'convex/react'
import ReactMarkdown from 'react-markdown'
import {
  Bot,
  Check,
  ChevronDown,
  Download,
  Edit3,
  File,
  FileCode,
  FileImage,
  FileText,
  Loader2,
  MoreHorizontal,
  Plus,
  Send,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import { api } from '../convex/_generated/api'
import type { Doc, Id } from '../convex/_generated/dataModel'
import './App.css'

type Artifact = { path: string; name: string; size: number; modified: string; turnId?: string }
type ToolCall = Doc<'toolCalls'>
type StreamEvent = Doc<'streamEvents'>
type Message = Doc<'messages'>

function App() {
  const threadResults = useQuery(api.threads.list)
  const threads = useMemo(() => threadResults ?? [], [threadResults])
  const createThreadSession = useAction(api.daytona.createThreadSession)
  const deleteThread = useAction(api.daytona.deleteThread)
  const runTurn = useAction(api.agent.runTurn)
  const listArtifacts = useAction(api.artifacts.list)
  const downloadArtifact = useAction(api.artifacts.download)
  const renameThread = useMutation(api.threads.rename)

  const [selectedThreadId, setSelectedThreadId] = useState<Id<'threads'> | null>(null)
  const [openMenuId, setOpenMenuId] = useState<Id<'threads'> | null>(null)
  const [editingId, setEditingId] = useState<Id<'threads'> | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [artifactBusy, setArtifactBusy] = useState(false)
  const [artifactPanelOpen, setArtifactPanelOpen] = useState(true)
  const [workspaceArtifactThreadId, setWorkspaceArtifactThreadId] = useState<Id<'threads'> | null>(null)
  const [workspaceArtifacts, setWorkspaceArtifacts] = useState<Artifact[]>([])
  const [error, setError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  const selectedThread = useMemo(
    () => threads.find((thread) => thread._id === selectedThreadId) ?? threads[0] ?? null,
    [selectedThreadId, threads],
  )
  const activeThreadId = selectedThread?._id
  const messages = useQuery(
    api.messages.listByThread,
    activeThreadId ? { threadId: activeThreadId } : 'skip',
  )
  const toolCalls = useQuery(
    api.toolCalls.listByThread,
    activeThreadId ? { threadId: activeThreadId } : 'skip',
  )
  const streamEvents = useQuery(
    api.streamEvents.listByThread,
    activeThreadId ? { threadId: activeThreadId } : 'skip',
  )
  const sessions = useQuery(
    api.sessions.listByThread,
    activeThreadId ? { threadId: activeThreadId } : 'skip',
  )
  const persistedArtifacts = useQuery(
    api.artifactRecords.listByThread,
    activeThreadId ? { threadId: activeThreadId } : 'skip',
  )
  const allArtifacts = useMemo(
    () => mergeArtifacts([
      ...(persistedArtifacts ?? []),
      ...(workspaceArtifactThreadId === activeThreadId ? workspaceArtifacts : []),
    ]),
    [activeThreadId, persistedArtifacts, workspaceArtifactThreadId, workspaceArtifacts],
  )

  const refreshArtifacts = useCallback(async (threadId = activeThreadId) => {
    if (!threadId) return
    setArtifactBusy(true)
    try {
      const files = await listArtifacts({ threadId })
      setWorkspaceArtifactThreadId(threadId)
      setWorkspaceArtifacts(files)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setArtifactBusy(false)
    }
  }, [activeThreadId, listArtifacts])

  const resizeComposer = useCallback(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    const maxHeight = Math.floor(window.innerHeight * 0.35)
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden'
  }, [])

  useEffect(() => {
    resizeComposer()
  }, [draft, resizeComposer])

  useEffect(() => {
    if (!error) return
    const timer = window.setTimeout(() => setError(null), 4500)
    return () => window.clearTimeout(timer)
  }, [error])

  async function handleNewThread() {
    setBusy(true)
    setError(null)
    try {
      const result = await createThreadSession({ title: `Conversation ${threads.length + 1}` })
      setSelectedThreadId(result.threadId)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const content = draft.trim()
    if (!content || !activeThreadId) return

    setDraft('')
    setBusy(true)
    setError(null)
    try {
      await runTurn({ threadId: activeThreadId, content })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleDownload(file: Artifact) {
    if (!activeThreadId) return
    setArtifactBusy(true)
    setError(null)
    try {
      const result = await downloadArtifact({ threadId: activeThreadId, path: file.path })
      const link = document.createElement('a')
      link.href = `data:${result.mimeType};base64,${result.base64}`
      link.download = result.name
      document.body.appendChild(link)
      link.click()
      link.remove()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setArtifactBusy(false)
    }
  }

  async function handleDownloadAll(files: Artifact[]) {
    for (const file of files) {
      await handleDownload(file)
    }
  }

  async function handleRename(threadId: Id<'threads'>) {
    const title = editingTitle.trim()
    if (!title) return
    await renameThread({ threadId, title })
    setEditingId(null)
    setEditingTitle('')
  }

  async function handleDelete(threadId: Id<'threads'>) {
    setBusy(true)
    setError(null)
    try {
      await deleteThread({ threadId })
      if (selectedThreadId === threadId) setSelectedThreadId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
      setOpenMenuId(null)
    }
  }

  const canSend = Boolean(activeThreadId && selectedThread?.status === 'ready' && draft.trim() && !busy)

  return (
    <main className={`app-shell ${artifactPanelOpen ? 'with-artifacts' : ''}`}>
      <aside className="sidebar">
        <div className="brand-bar">
          <div className="brand-mark"><Sparkles size={18} /></div>
          <div>
            <h1>Daytona Agent</h1>
            <p>Cloud workspaces for file-making agents</p>
          </div>
        </div>

        <button className="new-chat-button" type="button" onClick={handleNewThread} disabled={busy}>
          {busy ? <Loader2 className="spin" size={17} /> : <Plus size={17} />}
          New conversation
        </button>

        <div className="conversation-list">
          {threads.map((thread) => (
            <div key={thread._id} className={thread._id === activeThreadId ? 'conversation active' : 'conversation'}>
              {editingId === thread._id ? (
                <form
                  className="rename-form"
                  onSubmit={(event) => {
                    event.preventDefault()
                    void handleRename(thread._id)
                  }}
                >
                  <input
                    value={editingTitle}
                    onChange={(event) => setEditingTitle(event.target.value)}
                    autoFocus
                  />
                  <button type="submit" aria-label="Save name"><Check size={15} /></button>
                  <button type="button" aria-label="Cancel rename" onClick={() => setEditingId(null)}><X size={15} /></button>
                </form>
              ) : (
                <>
                  <button
                    className="conversation-main"
                    type="button"
                    onClick={() => {
                      setSelectedThreadId(thread._id)
                      if (thread.status === 'ready') void refreshArtifacts(thread._id)
                    }}
                  >
                    <span>{thread.title}</span>
                    <small>{thread.status}</small>
                  </button>
                  <div className="conversation-menu">
                    <button
                      type="button"
                      className="menu-trigger"
                      aria-label="Conversation options"
                      onClick={() => setOpenMenuId(openMenuId === thread._id ? null : thread._id)}
                    >
                      <MoreHorizontal size={17} />
                    </button>
                    {openMenuId === thread._id && (
                      <div className="menu-popover">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(thread._id)
                            setEditingTitle(thread.title)
                            setOpenMenuId(null)
                          }}
                        >
                          <Edit3 size={14} />
                          Rename
                        </button>
                        <button type="button" className="danger" onClick={() => void handleDelete(thread._id)}>
                          <Trash2 size={14} />
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          ))}
          {threads.length === 0 && <div className="empty-sidebar">No conversations yet.</div>}
        </div>
      </aside>

      <section className="chat-shell">
        <header className="chat-header">
          <div>
            <span className="workspace-label">{sessions?.[0]?.daytonaRuntime ?? 'workspace'}</span>
            <h2>{selectedThread?.title ?? 'Start a new conversation'}</h2>
          </div>
          <div className="header-actions">
            {selectedThread?.daytonaSessionId && <code>{selectedThread.daytonaSessionId}</code>}
            <button
              className="artifact-toggle"
              type="button"
              aria-pressed={artifactPanelOpen}
              onClick={() => setArtifactPanelOpen((open) => !open)}
            >
              <FileText size={17} />
              Artifacts
            </button>
          </div>
        </header>

        {error && (
          <div className="error-toast" role="alert">
            <span>{error}</span>
            <button type="button" aria-label="Dismiss error" onClick={() => setError(null)}>
              <X size={16} />
            </button>
          </div>
        )}

        <section className="message-scroll">
          {!activeThreadId && <WelcomePanel onStart={handleNewThread} busy={busy} />}
          {activeThreadId && messages?.length === 0 && (
            <div className="empty-chat">
              <Bot size={30} />
              <span>Ask the agent to create a PDF, script, report, or research brief.</span>
            </div>
          )}
          {(messages ?? []).map((message) => (
            <ChatMessage
              key={message._id}
              message={message}
              tools={toolsForTurn(toolCalls ?? [], message.turnId)}
              events={eventsForTurn(streamEvents ?? [], message.turnId)}
              artifacts={artifactsForTurn(persistedArtifacts ?? [], message.turnId)}
              artifactBusy={artifactBusy}
              onDownload={handleDownload}
            />
          ))}
        </section>

        <div className="composer-scrim" aria-hidden="true" />
        <form className="composer" onSubmit={handleSubmit}>
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={selectedThread?.status === 'ready' ? 'Ask Daytona Agent to make something...' : 'Create or wait for a ready conversation'}
            disabled={!activeThreadId || selectedThread?.status !== 'ready' || busy}
            rows={1}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                event.currentTarget.form?.requestSubmit()
              }
            }}
          />
          <button className="send-button" type="submit" disabled={!canSend} aria-label="Send message">
            {busy ? <Loader2 className="spin" size={18} /> : <Send size={18} />}
          </button>
        </form>
      </section>

      <ArtifactDrawer
        open={artifactPanelOpen}
        artifacts={allArtifacts}
        busy={artifactBusy}
        onClose={() => setArtifactPanelOpen(false)}
        onScan={() => void refreshArtifacts(activeThreadId)}
        onDownload={handleDownload}
        onDownloadAll={() => void handleDownloadAll(allArtifacts)}
      />
    </main>
  )
}

function ChatMessage({
  message,
  tools,
  events,
  artifacts,
  artifactBusy,
  onDownload,
}: {
  message: Message
  tools: ToolCall[]
  events: StreamEvent[]
  artifacts: Artifact[]
  artifactBusy: boolean
  onDownload: (file: Artifact) => void
}) {
  const isAssistant = message.role === 'assistant'
  return (
    <article className={`chat-message ${message.role}`}>
      <div className="bubble">
        <div className="message-label">{message.role}</div>

        {isAssistant && (events.length > 0 || tools.length > 0) && (
          <WorkDetails key={message.status} messageStatus={message.status} events={events} tools={tools} />
        )}

        {isAssistant ? (
          <div className="markdown-body">
            <ReactMarkdown>{message.content || (message.status === 'streaming' ? 'Working...' : '')}</ReactMarkdown>
          </div>
        ) : (
          <p>{message.content}</p>
        )}

        {isAssistant && artifacts.length > 0 && (
          <div className="artifact-cards">
            <div className="artifact-heading">Generated files</div>
            <div className="artifact-grid">
              {artifacts.map((file) => (
                <button
                  key={file.path}
                  className="artifact-card"
                  type="button"
                  disabled={artifactBusy}
                  onClick={() => onDownload(file)}
                >
                  <span className={`file-type ${artifactKind(file.name)}`}>
                    <ArtifactIcon fileName={file.name} size={18} />
                  </span>
                  <span>
                    <strong>{file.name}</strong>
                    <small>{formatBytes(file.size)} · {file.modified}</small>
                  </span>
                  <Download size={17} />
                </button>
              ))}
            </div>
          </div>
        )}

      </div>
    </article>
  )
}

function WorkDetails({
  messageStatus,
  events,
  tools,
}: {
  messageStatus: Message['status']
  events: StreamEvent[]
  tools: ToolCall[]
}) {
  const [open, setOpen] = useState(messageStatus !== 'complete')

  return (
    <details className="work-details" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>
        <span>Work details</span>
        <ChevronDown size={16} />
      </summary>
      <div className="work-tree">
        <details open>
          <summary>Reasoning and progress</summary>
          <div className="event-stack">
            {events.filter((event) => event.kind !== 'assistant_delta').map((event) => (
              <div key={event._id} className={`event-line ${event.kind}`}>
                <span className="event-dot" />
                <div>
                  <strong>{eventTitle(event)}</strong>
                  <small>{eventDescription(event)}</small>
                </div>
              </div>
            ))}
          </div>
        </details>
        {tools.length > 0 && (
          <details open>
            <summary>Tool calls</summary>
            <div className="tool-stack">
              {tools.map((tool) => (
                <details key={tool._id} className="tool-detail">
                  <summary>
                    <span>{tool.sequence}. {readableToolName(tool.toolName)}</span>
                    <small>{toolStatusLabel(tool.status)}</small>
                  </summary>
                  <div className="tool-readable">
                    <div>
                      <span>Input</span>
                      <p>{summarizeValue(tool.input) || 'No input shown'}</p>
                    </div>
                    <div>
                      <span>Result</span>
                      <p>{tool.output === undefined ? 'Waiting for result...' : summarizeValue(tool.output)}</p>
                    </div>
                  </div>
                </details>
              ))}
            </div>
          </details>
        )}
      </div>
    </details>
  )
}

function ArtifactDrawer({
  open,
  artifacts,
  busy,
  onClose,
  onScan,
  onDownload,
  onDownloadAll,
}: {
  open: boolean
  artifacts: Artifact[]
  busy: boolean
  onClose: () => void
  onScan: () => void
  onDownload: (file: Artifact) => void
  onDownloadAll: () => void
}) {
  return (
    <aside className={`artifact-drawer ${open ? 'open' : ''}`} aria-hidden={!open}>
      <div className="artifact-drawer-header">
        <div>
          <span>Files</span>
          <strong>{artifacts.length} artifacts</strong>
        </div>
        <button type="button" aria-label="Close artifacts" onClick={onClose}>
          <X size={17} />
        </button>
      </div>
      <div className="artifact-drawer-actions">
        <button type="button" onClick={onScan} disabled={busy}>
          {busy ? <Loader2 className="spin" size={16} /> : <FileText size={16} />}
          Scan workspace
        </button>
        <button type="button" onClick={onDownloadAll} disabled={busy || artifacts.length === 0}>
          <Download size={16} />
          Download all
        </button>
      </div>
      <div className="drawer-artifact-list">
        {artifacts.map((file) => (
          <button
            key={file.path}
            className={`drawer-artifact ${artifactKind(file.name)}`}
            type="button"
            disabled={busy}
            onClick={() => onDownload(file)}
          >
            <ArtifactIcon fileName={file.name} size={18} />
            <span>
              <strong>{file.name}</strong>
              <small>{formatBytes(file.size)} · {file.modified}</small>
            </span>
            <Download size={16} />
          </button>
        ))}
        {artifacts.length === 0 && (
          <div className="empty-artifacts">
            <FileText size={22} />
            <span>No generated files yet.</span>
          </div>
        )}
      </div>
    </aside>
  )
}

function WelcomePanel({ onStart, busy }: { onStart: () => void; busy: boolean }) {
  return (
    <div className="welcome-panel">
      <span className="eyebrow">Agentic file studio</span>
      <h2>Chat with an agent that creates real files in Daytona.</h2>
      <p>Generated PDFs, scripts, images, reports, and source files appear as download cards under the assistant’s final response.</p>
      <button className="hero-button" type="button" onClick={onStart} disabled={busy}>
        {busy ? <Loader2 className="spin" size={18} /> : <Plus size={18} />}
        Create workspace
      </button>
    </div>
  )
}

function toolsForTurn(tools: ToolCall[], turnId?: string) {
  if (!turnId) return []
  return tools.filter((tool) => tool.turnId === turnId)
}

function eventsForTurn(events: StreamEvent[], turnId?: string) {
  if (!turnId) return []
  return events.filter((event) => event.turnId === turnId)
}

function artifactsForTurn(artifacts: Artifact[], turnId?: string) {
  if (!turnId) return []
  return artifacts.filter((artifact) => artifact.turnId === turnId)
}

function ArtifactIcon({ fileName, size }: { fileName: string; size: number }) {
  const kind = artifactKind(fileName)
  if (kind === 'image') return <FileImage size={size} />
  if (kind === 'code') return <FileCode size={size} />
  if (kind === 'pdf' || kind === 'text') return <FileText size={size} />
  return <File size={size} />
}

function artifactKind(fileName: string) {
  const ext = fileName.toLowerCase().split('.').pop() ?? ''
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return 'image'
  if (['js', 'jsx', 'ts', 'tsx', 'py', 'json', 'html', 'css', 'sh', 'mjs', 'cjs'].includes(ext)) return 'code'
  if (ext === 'pdf') return 'pdf'
  if (['txt', 'md', 'csv', 'log'].includes(ext)) return 'text'
  return 'generic'
}

function mergeArtifacts(artifacts: Artifact[]) {
  return Array.from(
    artifacts.reduce((byPath, artifact) => byPath.set(artifact.path, artifact), new Map<string, Artifact>()).values(),
  ).sort((a, b) => a.name.localeCompare(b.name))
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function eventTitle(event: StreamEvent) {
  if (event.kind === 'tool_call') return 'Started a tool'
  if (event.kind === 'tool_delta') return 'Tool progress'
  if (event.kind === 'tool_result') return 'Finished a tool'
  if (event.kind === 'error') return 'Needs attention'
  return 'Progress update'
}

function eventDescription(event: StreamEvent) {
  const payload = asRecord(event.payload)
  if (!payload) return summarizeValue(event.payload)
  if (typeof payload.message === 'string') return compactText(payload.message)
  if (typeof payload.error === 'string') return compactText(payload.error)
  if (typeof payload.raw === 'string') return compactText(payload.raw)
  if (typeof payload.toolName === 'string') {
    const result = summarizeValue(payload.output ?? payload.input ?? payload.result)
    return result ? `${readableToolName(payload.toolName)}: ${result}` : readableToolName(payload.toolName)
  }
  if (typeof payload.exitCode === 'number') return `Command completed with exit code ${payload.exitCode}`
  return summarizeValue(payload) || 'Updated the workspace state'
}

function readableToolName(toolName: string) {
  return toolName
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function toolStatusLabel(status: ToolCall['status']) {
  if (status === 'started') return 'Started'
  if (status === 'streaming') return 'Running'
  if (status === 'complete') return 'Complete'
  return 'Failed'
}

function summarizeValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return compactText(value)
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) {
    if (value.length === 0) return 'No items'
    return compactText(value.slice(0, 3).map((item) => summarizeValue(item)).filter(Boolean).join(', '))
  }

  const record = asRecord(value)
  if (!record) return ''

  const priorityKeys = [
    'command',
    'cmd',
    'path',
    'filePath',
    'query',
    'url',
    'message',
    'error',
    'result',
    'output',
    'stdout',
    'stderr',
    'content',
    'text',
  ]
  for (const key of priorityKeys) {
    if (record[key] !== undefined) {
      const summary = summarizeValue(record[key])
      if (summary) return `${readableToolName(key)}: ${summary}`
    }
  }

  const keys = Object.keys(record).slice(0, 5).map(readableToolName)
  return keys.length > 0 ? `Updated ${keys.join(', ')}` : ''
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : null
}

function compactText(value: string) {
  const text = value.replace(/\s+/g, ' ').trim()
  return text.length > 180 ? `${text.slice(0, 180)}...` : text
}

export default App
