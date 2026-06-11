export type ArtifactType = 'markdown' | 'code' | 'image'

export type ArtifactSsePayload = {
  type: ArtifactType
  title: string
  content: string
}
