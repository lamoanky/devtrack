export const STATUSES = [
  'saved',
  'applied',
  'oa',
  'screened',
  'interview',
  'offer',
  'rejected',
  'ghosted',
] as const

export type Status = (typeof STATUSES)[number]

export const LOCATION_TYPES = ['onsite', 'remote', 'hybrid'] as const
export type LocationType = (typeof LOCATION_TYPES)[number]

export const RESUME_FORMATS = ['markdown', 'latex', 'html', 'embed'] as const
export type ResumeFormat = (typeof RESUME_FORMATS)[number]

export interface TimelineEvent {
  id: string
  at: string
  from?: Status | null
  to: Status
  note: string
}

export interface Application {
  id: string
  company: string
  role: string
  location: string
  locationType: LocationType
  reqId: string
  status: Status
  dateApplied: string | null
  salary: string
  jobUrl: string
  source: string
  notes: string
  resumeId: string | null
  favorite: boolean
  timeline: TimelineEvent[]
  createdAt: string
  updatedAt: string
}

export interface ResumeVersion {
  id: string
  label: string
  note: string
  format: ResumeFormat
  content: string
  embedUrl: string
  createdAt: string
}

export interface Resume {
  id: string
  name: string
  company: string
  applicationId: string | null
  format: ResumeFormat
  content: string
  embedUrl: string
  versions: ResumeVersion[]
  createdAt: string
  updatedAt: string
}

export interface Stats {
  total: number
  active: number
  sent: number
  byStatus: Record<Status, number>
  funnel: { stage: string; count: number }[]
  responseRate: number
  interviewRate: number
  offerRate: number
  weeks: { week: string; count: number }[]
  topCompanies: { company: string; count: number }[]
  resumes: { total: number; linked: number; coverage: number }
}

export type ApplicationDraft = Partial<
  Pick<
    Application,
    | 'company'
    | 'role'
    | 'location'
    | 'locationType'
    | 'reqId'
    | 'status'
    | 'dateApplied'
    | 'salary'
    | 'jobUrl'
    | 'source'
    | 'notes'
    | 'resumeId'
    | 'favorite'
  >
>

export type ResumeDraft = Partial<
  Pick<Resume, 'name' | 'company' | 'applicationId' | 'format' | 'content' | 'embedUrl'>
>

export const RESUME_ASSIGNMENT_MODES = ['link', 'fork'] as const
export type ResumeAssignmentMode = (typeof RESUME_ASSIGNMENT_MODES)[number]

export interface Settings {
  /** Resume attached to every new application, or null for none. */
  defaultResumeId: string | null
  /** 'link' shares the one document; 'fork' gives each application its own copy. */
  defaultResumeMode: ResumeAssignmentMode
}

/** One document in an exported bundle. */
export interface ResumeExport {
  name: string
  company: string
  format: ResumeFormat
  content: string
  embedUrl: string
  versions: ResumeVersion[]
  linkedCompany: string | null
  createdAt: string
  updatedAt: string
}

export interface ResumeBundle {
  kind: 'devtrack.resumes'
  version: number
  exportedAt: string
  resumes: ResumeExport[]
}

export interface User {
  id: string
  username: string | null
  email: string | null
  /** Display name: the Google profile name, else the username. */
  name: string
  avatarUrl: string | null
  provider: 'password' | 'google'
}
