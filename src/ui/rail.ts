/** The width at which the rail replaces the tabs, the prototype's 720px. The CSS repeats it. */
const RAIL_SHOWS = "(min-width: 720px)";

/** Whether the rail shows: desktop rather than a phone's layout. */
export const railShows = (): boolean => window.matchMedia(RAIL_SHOWS).matches;
