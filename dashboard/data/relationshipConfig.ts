// Relationship type configuration for display labels and colors

export type RelationshipType = 
  | 'LOVERS'
  | 'CRUSH'
  | 'CLOSE_FRIEND'
  | 'FRIEND'
  | 'ACQUAINTANCE'
  | 'DISLIKE'
  | 'HATE'
  | 'NEUTRAL'
  | 'FAMILY'
  | 'RIVAL'
  | 'ADMIRE'
  | 'OTHER';

export type RelationshipTypeConfig = {
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  icon: string; // Font Awesome icon class
};

export const RELATIONSHIP_CONFIG: Record<RelationshipType, RelationshipTypeConfig> = {
  LOVERS: {
    label: 'Lovers',
    color: '#e07a7a',
    bgColor: 'rgba(224, 122, 122, 0.25)',
    borderColor: 'rgba(224, 122, 122, 0.3)',
    icon: 'fa-heart-pulse',
  },
  CRUSH: {
    label: 'Crush',
    color: '#ff69b4',
    bgColor: 'rgba(255, 105, 180, 0.25)',
    borderColor: 'rgba(255, 105, 180, 0.3)',
    icon: 'fa-heart',
  },
  CLOSE_FRIEND: {
    label: 'Close Friend',
    color: '#49d59c', // --totk-light-green
    bgColor: 'rgba(73, 213, 156, 0.25)',
    borderColor: 'rgba(73, 213, 156, 0.3)',
    icon: 'fa-heart-circle-check',
  },
  FRIEND: {
    label: 'Friend',
    color: '#20b2aa',
    bgColor: 'rgba(32, 178, 170, 0.25)',
    borderColor: 'rgba(32, 178, 170, 0.3)',
    icon: 'fa-heart-circle-plus',
  },
  ACQUAINTANCE: {
    label: 'Acquaintance',
    color: '#60a5fa', // Light blue - distinct and visible
    bgColor: 'rgba(96, 165, 250, 0.25)',
    borderColor: 'rgba(96, 165, 250, 0.3)',
    icon: 'fa-heart-circle-minus',
  },
  DISLIKE: {
    label: 'Dislike',
    color: '#ff8c00',
    bgColor: 'rgba(255, 140, 0, 0.25)',
    borderColor: 'rgba(255, 140, 0, 0.3)',
    icon: 'fa-heart-circle-xmark',
  },
  HATE: {
    label: 'Hate',
    color: '#dc3545',
    bgColor: 'rgba(220, 53, 69, 0.25)',
    borderColor: 'rgba(220, 53, 69, 0.3)',
    icon: 'fa-heart-crack',
  },
  NEUTRAL: {
    label: 'Neutral',
    color: '#888888', // --totk-grey-200
    bgColor: 'rgba(136, 136, 136, 0.25)',
    borderColor: 'rgba(136, 136, 136, 0.3)',
    icon: 'fa-heart-circle-minus',
  },
  FAMILY: {
    label: 'Family',
    color: '#ffd700',
    bgColor: 'rgba(255, 215, 0, 0.25)',
    borderColor: 'rgba(255, 215, 0, 0.3)',
    icon: 'fa-heart-circle-bolt',
  },
  RIVAL: {
    label: 'Rival',
    color: '#9370db',
    bgColor: 'rgba(147, 112, 219, 0.25)',
    borderColor: 'rgba(147, 112, 219, 0.3)',
    icon: 'fa-heart-circle-exclamation',
  },
  ADMIRE: {
    label: 'Admire',
    color: '#00a3da', // --botw-blue
    bgColor: 'rgba(0, 163, 218, 0.25)',
    borderColor: 'rgba(0, 163, 218, 0.3)',
    icon: 'fa-heart-circle-plus',
  },
  OTHER: {
    label: 'Other',
    color: '#a78bfa', // Light purple - distinct color
    bgColor: 'rgba(167, 139, 250, 0.25)',
    borderColor: 'rgba(167, 139, 250, 0.3)',
    icon: 'fa-heart-circle-minus',
  },
};
