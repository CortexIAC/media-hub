import type { ReactElement } from 'react'

export interface IconProps {
  size?: number
  className?: string
  strokeWidth?: number
}

function Icon({
  size = 18,
  className,
  strokeWidth = 1.7,
  children,
  fill = 'none'
}: IconProps & { children: ReactElement | ReactElement[]; fill?: string }): ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  )
}

export const SearchIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-3.6-3.6" />
  </Icon>
)

export const PlayIcon = (p: IconProps) => (
  <Icon {...p} fill="currentColor">
    <path d="M8 5.5v13l11-6.5z" stroke="none" />
  </Icon>
)

export const PauseIcon = (p: IconProps) => (
  <Icon {...p} fill="currentColor">
    <rect x="7" y="5" width="3.4" height="14" rx="1" stroke="none" />
    <rect x="13.6" y="5" width="3.4" height="14" rx="1" stroke="none" />
  </Icon>
)

export const SkipBackIcon = (p: IconProps) => (
  <Icon {...p} fill="currentColor">
    <path d="M18.5 5.8v12.4L9 12z" stroke="none" />
    <rect x="5.5" y="5.5" width="2" height="13" rx="0.8" stroke="none" />
  </Icon>
)

export const SkipForwardIcon = (p: IconProps) => (
  <Icon {...p} fill="currentColor">
    <path d="M5.5 5.8v12.4L15 12z" stroke="none" />
    <rect x="16.5" y="5.5" width="2" height="13" rx="0.8" stroke="none" />
  </Icon>
)

export const ShuffleIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M16.5 4.5h4v4" />
    <path d="M20.5 4.5l-6.2 6.2a3.5 3.5 0 0 1-5 0L3.5 5" />
    <path d="M16.5 19.5h4v-4" />
    <path d="M20.5 19.5l-6.2-6.2a3.5 3.5 0 0 1 0-5l1.2-1.2" />
    <path d="M3.5 19.5l4.3-4.3" />
  </Icon>
)

export const RepeatIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 9V8a3 3 0 0 1 3-3h13" />
    <path d="M17 2.5L20.5 5L17 7.5" />
    <path d="M20 15v1a3 3 0 0 1-3 3H4" />
    <path d="M7 16.5L3.5 19L7 21.5" />
  </Icon>
)

export const RepeatOneIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 9V8a3 3 0 0 1 3-3h13" />
    <path d="M17 2.5L20.5 5L17 7.5" />
    <path d="M20 15v1a3 3 0 0 1-3 3H4" />
    <path d="M7 16.5L3.5 19L7 21.5" />
    <path d="M11.4 10.4l1.5-1v5.2" strokeWidth={1.5} />
  </Icon>
)

export const HeartIcon = ({ filled, ...p }: IconProps & { filled?: boolean }) => (
  <Icon {...p} fill={filled ? 'currentColor' : 'none'}>
    <path
      d="M12 20s-7.3-4.4-7.3-9.2A4.1 4.1 0 0 1 12 8.2a4.1 4.1 0 0 1 7.3 2.6C19.3 15.6 12 20 12 20z"
      stroke={filled ? 'none' : 'currentColor'}
    />
  </Icon>
)

export const QueueIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 6.5h11" />
    <path d="M4 12h11" />
    <path d="M4 17.5h7" />
    <path d="M17.5 12v8.2" />
    <circle cx="20" cy="18.2" r="2.2" />
    <path d="M17.5 12l5-1.4" />
  </Icon>
)

export const VolumeIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 9.5h3.2L12 5.6v12.8L7.2 14.5H4z" />
    <path d="M15.5 9a4.2 4.2 0 0 1 0 6" />
    <path d="M18 6.5a8 8 0 0 1 0 11" />
  </Icon>
)

export const VolumeMuteIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 9.5h3.2L12 5.6v12.8L7.2 14.5H4z" />
    <path d="M16 9.5l5 5" />
    <path d="M21 9.5l-5 5" />
  </Icon>
)

export const MusicIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9 18V6l11-2v12" />
    <circle cx="6.5" cy="18" r="2.6" />
    <circle cx="17.5" cy="16" r="2.6" />
  </Icon>
)

export const VideoIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="5" width="13" height="14" rx="2" />
    <path d="M16 10l5-3v10l-5-3" />
  </Icon>
)

export const StreamsIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="2.4" />
    <path d="M8.2 8.2a5.4 5.4 0 0 0 0 7.6" />
    <path d="M15.8 15.8a5.4 5.4 0 0 0 0-7.6" />
    <path d="M5.4 5.4a9.3 9.3 0 0 0 0 13.2" />
    <path d="M18.6 18.6a9.3 9.3 0 0 0 0-13.2" />
  </Icon>
)

export const LibraryIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 5.5h4v13H4z" />
    <path d="M10 5.5h4v13h-4z" />
    <path d="M17 5.9l2.8 12.3-3.2.7L13.8 6.6z" />
  </Icon>
)

export const BookIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5V5.5Z" />
    <path d="M8 7h7M8 10.5h4.5" />
  </Icon>
)

export const DevicesIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="2.5" y="4.5" width="13" height="9.5" rx="1.6" />
    <path d="M6.5 18.5h5.5" />
    <path d="M9.5 14v4.5" />
    <rect x="17" y="9.5" width="4.5" height="10" rx="1.3" />
    <path d="M19.2 17.4h.1" />
  </Icon>
)

export const SettingsIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 7h9" />
    <path d="M17 7h3" />
    <circle cx="15" cy="7" r="2" />
    <path d="M4 17h3" />
    <path d="M11 17h9" />
    <circle cx="9" cy="17" r="2" />
    <path d="M4 12h5" />
    <path d="M13 12h7" />
    <circle cx="11" cy="12" r="1.8" />
  </Icon>
)

export const FolderIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />
  </Icon>
)

export const PlusIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  </Icon>
)

export const TrashIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4.5 7h15" />
    <path d="M9 7V5.2A1.2 1.2 0 0 1 10.2 4h3.6A1.2 1.2 0 0 1 15 5.2V7" />
    <path d="M6.5 7l.9 12a1.5 1.5 0 0 0 1.5 1.4h6.2a1.5 1.5 0 0 0 1.5-1.4L17.5 7" />
    <path d="M10.5 11v6" />
    <path d="M13.5 11v6" />
  </Icon>
)

export const MoreIcon = (p: IconProps) => (
  <Icon {...p} fill="currentColor">
    <circle cx="5.5" cy="12" r="1.5" stroke="none" />
    <circle cx="12" cy="12" r="1.5" stroke="none" />
    <circle cx="18.5" cy="12" r="1.5" stroke="none" />
  </Icon>
)

export const ExternalIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M14 4h6v6" />
    <path d="M20 4l-8.5 8.5" />
    <path d="M18 14.5V19a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19V7.5A1.5 1.5 0 0 1 5 6h4.5" />
  </Icon>
)

export const ChevronLeftIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M14.5 6L8.5 12l6 6" />
  </Icon>
)

export const ChevronRightIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9.5 6l6 6-6 6" />
  </Icon>
)

export const ChevronDownIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 9.5l6 6 6-6" />
  </Icon>
)

export const CloseIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 6l12 12" />
    <path d="M18 6L6 18" />
  </Icon>
)

export const MinimizeIcon = (p: IconProps) => (
  <Icon {...p} strokeWidth={1.2}>
    <path d="M5 12h14" />
  </Icon>
)

export const MaximizeIcon = (p: IconProps) => (
  <Icon {...p} strokeWidth={1.2}>
    <rect x="5.5" y="5.5" width="13" height="13" />
  </Icon>
)

export const RestoreIcon = (p: IconProps) => (
  <Icon {...p} strokeWidth={1.2}>
    <rect x="8.5" y="8.5" width="10" height="10" />
    <path d="M5.5 15.5v-10h10" />
  </Icon>
)

export const DiscIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="2.2" />
  </Icon>
)

export const AlertIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 4.5l8.5 15h-17z" />
    <path d="M12 10v4.5" />
    <path d="M12 17.2h.01" />
  </Icon>
)

export const CheckIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 12.5l4.5 4.5L19 7" />
  </Icon>
)

export const InfoIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 11v5.5" />
    <path d="M12 7.8h.01" />
  </Icon>
)

export const PersonIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="8" r="3.6" />
    <path d="M4.8 20a7.4 7.4 0 0 1 14.4 0" />
  </Icon>
)

export const ImportIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3.5v10" />
    <path d="M8 9.5l4 4 4-4" />
    <path d="M4.5 16v3a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-3" />
  </Icon>
)

export const RefreshIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M20 11a8 8 0 1 0-2.4 6" />
    <path d="M20 5v6h-6" />
  </Icon>
)
