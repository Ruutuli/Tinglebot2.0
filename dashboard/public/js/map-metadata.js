/**
 * Map Metadata - Square status and region information from database
 * Loads from GET /api/explore/map-metadata (exploringMap collection).
 * DB statuses: inaccessible | unexplored | explored | secured.
 * "Explorable" (UI) = any quadrant with status !== 'inaccessible'.
 */

function isQuadrantExplorableStatus(status) {
    const s = (status || '').toLowerCase();
    return s === 'unexplored' || s === 'explored' || s === 'secured';
}

class MapMetadata {
    constructor() {
        this.squareData = new Map();
    }

    /**
     * Load square data from API (exploringMap collection).
     * @returns {Promise<void>}
     */
    async loadFromAPI() {
        const base = (typeof window !== 'undefined' && window.__NEXT_DATA__?.basePath) || '';
        const apiBase = base.replace(/\/$/, '');
        const url = `${apiBase}/api/explore/map-metadata`;
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) throw new Error('Failed to load map metadata');
        const data = await res.json();
        const squares = data.squares || [];
        this.squareData.clear();
        squares.forEach(function (row) {
            this.squareData.set(row.square, {
                square: row.square,
                letter: row.letter || (row.square && row.square.charAt(0)) || '',
                number: row.number != null ? row.number : 0,
                region: row.region || 'Unknown',
                quadrants: Array.isArray(row.quadrants) ? row.quadrants : []
            });
        }, this);
    }

    getSquareMetadata(squareId) {
        return this.squareData.get(squareId) || null;
    }

    getSquaresByRegion(region) {
        const squares = [];
        for (const [squareId, data] of this.squareData) {
            if (data.region === region) squares.push(squareId);
        }
        return squares;
    }

    getSquaresWithExplorableQuadrants() {
        const squares = [];
        for (const [squareId, data] of this.squareData) {
            if (data.quadrants && data.quadrants.some(q => isQuadrantExplorableStatus(q.status)))
                squares.push(squareId);
        }
        return squares;
    }

    getSquaresWithOnlyInaccessibleQuadrants() {
        const squares = [];
        for (const [squareId, data] of this.squareData) {
            if (data.quadrants && data.quadrants.every(q => (q.status || '').toLowerCase() === 'inaccessible'))
                squares.push(squareId);
        }
        return squares;
    }

    getRegions() {
        const regions = new Set();
        for (const data of this.squareData.values()) {
            regions.add(data.region);
        }
        return Array.from(regions);
    }

    getStatuses() {
        return ['Explorable', 'Inaccessible'];
    }

    hasExplorableQuadrants(squareId) {
        const metadata = this.getSquareMetadata(squareId);
        return metadata && metadata.quadrants
            ? metadata.quadrants.some(q => isQuadrantExplorableStatus(q.status))
            : false;
    }

    hasOnlyInaccessibleQuadrants(squareId) {
        const metadata = this.getSquareMetadata(squareId);
        return metadata && metadata.quadrants
            ? metadata.quadrants.every(q => (q.status || '').toLowerCase() === 'inaccessible')
            : true;
    }

    getRegion(squareId) {
        const metadata = this.getSquareMetadata(squareId);
        return metadata ? metadata.region : null;
    }

    getStatus(squareId) {
        const metadata = this.getSquareMetadata(squareId);
        if (!metadata) return null;
        const hasExplorable = metadata.quadrants &&
            metadata.quadrants.some(q => isQuadrantExplorableStatus(q.status));
        return hasExplorable ? 'Explorable' : 'Inaccessible';
    }

    isExplorable(squareId) {
        return this.hasExplorableQuadrants(squareId);
    }

    isInaccessible(squareId) {
        return this.hasOnlyInaccessibleQuadrants(squareId);
    }

    getSquaresByStatus(status) {
        const normalized = (status || '').toLowerCase();
        if (normalized === 'explorable') return this.getSquaresWithExplorableQuadrants();
        if (normalized === 'inaccessible') return this.getSquaresWithOnlyInaccessibleQuadrants();
        return [];
    }

    getQuadrants(squareId) {
        const metadata = this.getSquareMetadata(squareId);
        return metadata ? metadata.quadrants : null;
    }

    isQuadrantBlighted(squareId, quadrant) {
        const quadrants = this.getQuadrants(squareId);
        if (!quadrants) return false;
        const quadrantData = quadrants.find(q => q.quadrantId === 'Q' + quadrant);
        return quadrantData ? !!quadrantData.blighted : false;
    }

    isQuadrantExplorable(squareId, quadrant) {
        const quadrants = this.getQuadrants(squareId);
        if (!quadrants) return false;
        const quadrantData = quadrants.find(q => q.quadrantId === 'Q' + quadrant);
        return quadrantData ? isQuadrantExplorableStatus(quadrantData.status) : false;
    }

    getQuadrantStatus(squareId, quadrant) {
        const quadrants = this.getQuadrants(squareId);
        if (!quadrants) return null;
        const quadrantData = quadrants.find(q => q.quadrantId === 'Q' + quadrant);
        return quadrantData ? quadrantData.status : null;
    }

    getExplorableQuadrants(squareId) {
        const quadrants = this.getQuadrants(squareId);
        if (!quadrants) return [];
        return quadrants
            .filter(q => isQuadrantExplorableStatus(q.status))
            .map(q => q.quadrantId);
    }

    getBlightedQuadrants(squareId) {
        const quadrants = this.getQuadrants(squareId);
        if (!quadrants) return [];
        return quadrants.filter(q => q.blighted).map(q => q.quadrantId);
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = MapMetadata;
}
