import type { ScreenDefinition } from '../../data/screens'
import { KnowledgeScreen } from './KnowledgeScreens'
import { ManagementScreen } from './ManagementScreens'
import { OperationsScreen } from './OperationsScreens'
import { SettingsScreen } from './SettingsScreens'

interface AdminScreenProps {
  screen: ScreenDefinition
  navigate: (id: string) => void
}

export function AdminScreen({ screen, navigate }: AdminScreenProps) {
  return (
    <>
      <OperationsScreen screen={screen} navigate={navigate} />
      <KnowledgeScreen screen={screen} navigate={navigate} />
      <ManagementScreen screen={screen} navigate={navigate} />
      <SettingsScreen screen={screen} />
    </>
  )
}
