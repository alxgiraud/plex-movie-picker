import { PLEX_TOKEN } from './config.js';
import { shuffleArray } from './utils.js';

const API_URL = '/api/movies';

export const fetchPlexWatchlist = async (start, genreKey, durationRange) => {

    const baseUrl = 'https://discover.provider.plex.tv';
    const tokenParam = `&X-Plex-Token=${PLEX_TOKEN}&X-Plex-Container-Start=${start}`;

    const url = (genreKey !== 'any')
        ? `${baseUrl}${genreKey}${tokenParam}`
        : `${baseUrl}/library/sections/watchlist/all?${tokenParam}`;

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'text/xml',
                'X-Plex-Token': PLEX_TOKEN
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const xml = await response.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xml, 'application/xml');
        let result = {};

        for (const attr of xmlDoc.documentElement.attributes) {
            result[attr.name] = attr.value;
        }

        const movies = Array.from(xmlDoc.documentElement.querySelectorAll('Video'));
        result.movies = movies.map(movie => {

            let durationString = movie.getAttribute('duration');
            let durationInSeconds = parseInt(durationString) / 1000;

            if (durationInSeconds >= durationRange.min && durationInSeconds <= durationRange.max) {
                return {
                    guid: movie.getAttribute('guid').split('/').pop(),
                    title: movie.getAttribute('title'),
                    duration: durationInSeconds,
                };
            } else {
                return null;
            }
        }).filter(movie => movie !== null);;

        return result;
    } catch (error) {
        console.error('Error fetching Plex watchlist:', error);
    }
};

export const fetchGenres = async () => {

    let url = `https://discover.provider.plex.tv/library/sections/watchlist/genre?X-Plex-Token=${PLEX_TOKEN}`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Error ${response.status}: ${response.statusText}`);
        }
        const xml = await response.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xml, 'application/xml');
        const directories = xmlDoc.getElementsByTagName('Directory');
        let result = [];

        for (let i = 0; i < directories.length; i++) {
            const label = directories[i].getAttribute('title');
            const key = directories[i].getAttribute('key');
            result.push({ label, key });
        }

        return result;

    } catch (error) {
        console.error('Error fetching movie:', error.message);
        throw error;
    }
};

export const fetchMovieDetails = async (guid) => {
    let url = `https://discover.provider.plex.tv/library/metadata/${guid}?X-Plex-Token=${PLEX_TOKEN}`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Error ${response.status}: ${response.statusText}`);
        }
        const xml = await response.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xml, 'application/xml');

        const videoNode = xmlDoc.querySelector('Video');

        const getAttr = (node, attr) => node ? node.getAttribute(attr) : null;
        const getFloatAttr = (node, attr) => node ? parseFloat(node.getAttribute(attr)) : null;
        const getIntAttr = (node, attr) => node ? parseInt(node.getAttribute(attr), 10) : null;
        //const getTextContent = (node) => node ? node.textContent : null;
        const getNode = (query) => xmlDoc.querySelector(query);
        const getAllNodes = (query) => Array.from(xmlDoc.querySelectorAll(query));

        const guid = getAttr(videoNode, "guid").split('/').pop();
        const summary = getAttr(videoNode, "summary");
        const tagline = getAttr(videoNode, "tagline");
        const thumb = getAttr(videoNode, "thumb");
        const year = getIntAttr(videoNode, "year");
        const duration = getIntAttr(videoNode, "duration");
        const title = getAttr(videoNode, "title");

        const images = {
            background: getAttr(getNode('Image[type="background"]'), "url"),
            banner: getAttr(getNode('Image[type="banner"]'), "url"),
            clearLogo: getAttr(getNode('Image[type="clearLogo"]'), "url"),
            clearLogoWide: getAttr(getNode('Image[type="clearLogoWide"]'), "url"),
            coverArt: getAttr(getNode('Image[type="coverArt"]'), "url"),
            coverPoster: getAttr(getNode('Image[type="coverPoster"]'), "url"),
            coverSquare: getAttr(getNode('Image[type="coverSquare"]'), "url"),
            snapshot: getAttr(getNode('Image[type="snapshot"]'), "url"),
        };

        const genres = getAllNodes("Genre").map(genre => getAttr(genre, "tag"));

        const extractSource = (image) => {
            if (image.includes('imdb')) return 'imdb';
            if (image.includes('rottentomatoes')) return 'rottentomatoes';
            if (image.includes('themoviedb')) return 'themoviedb';
            return 'unknown';
        };

        const extractIcon = (image) => {
            const match = image.match(/rating\.(\w+)/);
            return match ? match[1] : null;
        };

        const ratings = getAllNodes("Rating").map(rating => {
            const image = getAttr(rating, "image");
            const type = getAttr(rating, "type");
            const sourceBase = extractSource(image);

            let source = sourceBase;
            let icon = null;

            if (sourceBase === 'rottentomatoes') {
                if (type === 'critic') {
                    source = 'rottentomatoesCritic';
                } else if (type === 'audience') {
                    source = 'rottentomatoesAudience';
                }
                icon = extractIcon(image);
            }

            const ratingObj = {
                source,
                value: getFloatAttr(rating, "value")
            };

            if (icon) {
                ratingObj.icon = icon;
            }

            return ratingObj;
        });

        const guids = getAllNodes("Guid").map(guid => getAttr(guid, "id"));
        const countries = getAllNodes("Country").map(country => getAttr(country, "tag"));
        const director = getAttr(getNode("Director"), "tag");

        const summaries = {
            summary100: getAttr(getNode('Summary[size="100"]'), "tag"),
            summary250: getAttr(getNode('Summary[size="250"]'), "tag"),
            summary500: getAttr(getNode('Summary[size="500"]'), "tag"),
        };

        return {
            guid,
            summary,
            tagline,
            thumb,
            year,
            duration,
            title,
            images,
            genres,
            ratings,
            guids,
            countries,
            director,
            ...summaries,
        };

    } catch (error) {
        console.error('Error fetching movie:', error.message);
        throw error;
    }
};

export const fetchAllMovies = async() => {
    try {
        const response = await fetch(API_URL);
        if (!response.ok) {
            throw new Error(`Error ${response.status}: ${response.statusText}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Error fetching all movies:', error.message);
        throw error;
    }
};

export const saveWatchlist = async (watchlist) => {

    const movies = shuffleArray(watchlist);
    try {
        const response = await fetch(`${API_URL}/overwrite`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ movies })
        });

        if (!response.ok) {
            throw new Error(`Error ${response.status}: ${response.statusText}`);
        }

        return response;
    } catch (error) {
        console.error('Error submitting watchlist:', error);
    }
};

export const resetVotes = async () => {
    try {
        const response = await fetch(`${API_URL}/reset`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Error ${response.status}: ${response.statusText}`);
        }
    } catch (error) {
        console.error('Error resetting votes:', error);
    }
};

export const vote = async (movieId, voteType) => {
    try {
        const response = await fetch(`${API_URL}/${movieId}/vote`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ movieId, voteType })
        });
        if (!response.ok) {
            throw new Error(`Error ${response.status}: ${response.statusText}`);
        }

        return response;
    } catch (error) {
        console.error('Error voting', error);
    }
};

export const fetchMatchingMovies = async () => {
    try {
        const response = await fetch(`${API_URL}/votes-above/1`);
        const result = await response.json();
        return result.data;
    } catch (error) {
        console.error('Error fetching matching movies:', error.message);
        throw error;
    }
};

export const canMatch = async () => {
    try {
        const response = await fetch(`${API_URL}/can-match`);
        const result = await response.json();
        return result.matchPossible;
    } catch (error) {
        console.error('Error checking if it can still match:', error.message);
        throw error;
    }
};

export const decrementDownvotes = async () => {
    try {
        const response = await fetch(`${API_URL}/decrement-downvotes`, {
            method: 'POST'
        });
        const result = await response.json();
        return result.message;
    } catch (error) {
        console.error('Error decrementing downvotes:', error.message);
        throw error;
    }
};