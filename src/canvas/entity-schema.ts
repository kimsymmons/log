// src/canvas/entity-schema.ts
// Canonical entity schema for Log canvas node types.
// Read this before implementing any node type or importer.

export type CardType = 'thread' | 'idea' | 'project' | 'doc' | 'sketch';

export type ProjectSource = 'linear' | 'claude' | 'git' | 'openclaw' | string;

// ─── Thread ────────────────────────────────────────────────────────────────
// Source: Claude chat conversations. Loaded via GET /artifacts?type=chat.
// Auto-tagged (max 4, kebab-case, keyword extraction).
// AI also classifies whether the thread contains a project idea (→ Idea node).
export interface ThreadEntity {
  id: string;
  type: 'thread';
  title: string;
  body: string;           // First two sentences of the first message
  messageCount: number;
  lastMessageAt: string;  // ISO timestamp
  sourceUrl: string;      // https://claude.ai/chat/{id}
  tags: string[];         // Auto-generated, max 4
  ideaExtracted: boolean; // Whether AI has run idea-detection on this thread
}

// ─── Idea ──────────────────────────────────────────────────────────────────
// NOT manually created. AI-extracted from Thread cards by haiku.
// Only generated when a concrete project idea is detected in the conversation.
// Shopping lists, topic exploration, political discussions → no Idea node.
// Structural link back to source Thread (NOT tag-derived).
// Can be promoted to Project.
// Future: can also produce Article/Post (design TBD — new node or Idea artefact).
export interface IdeaEntity {
  id: string;
  type: 'idea';
  title: string;            // AI-extracted short noun phrase
  description: string;      // 1–2 sentences, AI-extracted
  sourceThreadId: string;   // Artifact ID of the Thread this came from
  sourceThreadTitle: string;
  tags: string[];           // Auto-generated from title + description, max 4
  status: 'idea' | 'project';
  extractedAt: string;
}

// ─── Project ───────────────────────────────────────────────────────────────
// Normalised from multiple sources via entity mapping layer.
// Sources: Linear (via MCP), Claude projects, future: Git repos, Open Claw.
// Schema is source-agnostic — all sources map to this shape.
export interface ProjectEntity {
  id: string;                  // "${source}:${sourceId}" e.g. "linear:PRJ-1"
  type: 'project';
  source: ProjectSource;
  title: string;
  description?: string;
  status?: string;             // "In progress" | "Planned" | "Done" | source-specific
  statusColour?: string;       // CSS colour for status dot
  issueCount?: number;         // Linear: issue count
  targetDate?: string;         // ISO date
  sourceUrl: string;           // Deep link back to source
  tags: string[];              // Auto-generated from title + description, max 4
  importedAt: string;
}

// ─── Doc ───────────────────────────────────────────────────────────────────
// Documents. Sources TBD (Google Docs, Notion, local files, etc.)
export interface DocEntity {
  id: string;
  type: 'doc';
  title: string;
  preview: string;         // First 1–2 sentences or AI summary
  updatedAt: string;
  sourceUrl?: string;
  tags: string[];
}

// ─── Sketch ────────────────────────────────────────────────────────────────
// Hand-drawn or generated visual. Sources TBD.
export interface SketchEntity {
  id: string;
  type: 'sketch';
  title: string;
  drawingData?: unknown;   // tldraw or other format TBD
  tags: string[];
}

// ─── Union ─────────────────────────────────────────────────────────────────
export type CanvasEntity =
  | ThreadEntity
  | IdeaEntity
  | ProjectEntity
  | DocEntity
  | SketchEntity;

// ─── Relationships ─────────────────────────────────────────────────────────
// Two kinds of connections on the canvas:
//
// 1. TAG-DERIVED (computed, never stored):
//    A line exists between any two cards that share a tag.
//    Implemented in TagConnectionOverlay — derived every render.
//
// 2. STRUCTURAL (stored, persistent):
//    Thread → Idea: stored as Idea.sourceThreadId
//    Idea → Project: via Idea.status = 'project' + a promotedProjectId field
//    Structural lines render differently from tag-derived lines.
//
// Future relationship types:
//    Idea → Article/Post (design TBD)
//    Project → Git repo (future source)
