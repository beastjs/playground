import type { ClassValue } from 'octane'
import type { IconNameType } from './icons'

export type IconList = Record<IconNameType, { viewBox: string; symbol: string }>

export type IconName = IconNameType

export interface IconProps {
  name: IconName
  className?: ClassValue
  size?: number
  color?: string
  solid?: boolean
  onClick?: VoidFunction
  svgStyle?: ClassValue
}

export interface IconData {
  symbol: string
  set: string
  viewBox?: string
}
