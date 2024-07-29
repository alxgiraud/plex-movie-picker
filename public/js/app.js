import * as api from './api.js';

export const app = () => {

    const API_URL = '/api/movies';

    const waitingInfo = {
        id: 'waiting',
        isDisplayed: true,
        headline: 'All movies voted',
        message: 'You have voted for all the movies in your watchlist. Now, wait for others to vote to see if there\'s a match.',
        cover: 'assets/img/waiting.jpg',
        poster: null,
    };

    const matchingInfo = {
        id: 'match',
        isDisplayed: true,
        headline: 'It\'s a match!',
        message: 'Great choice! Get ready to watch your new favorite film together.',
        cover: null,
        poster: null,
    };

    const noMatchingInfo = {
        id: 'no-match',
        isDisplayed: true,
        headline: 'No match found...',
        message: 'All votes are in, but no matches were found. Please try voting again or select a different set of movies.',
        cover: 'assets/img/no-match.jpg',
        poster: null,
    };

    const noUpvotesInfo = {
        id: 'no-upvotes',
        isDisplayed: true,
        headline: 'No upvote!',
        message: 'You haven\'t upvoted any films. Please vote again or reload different films to find matches.',
        cover: 'assets/img/no-upvote.jpg',
        poster: null,
    };

    return {

        isLoadingGenres: true,              //genres are loading (true at init)
        isLoadingWatchlist: false,          //watchlist is loading
        isLoadingMovie: false,              //some movie details are loading

        endOfVotesInfo: {
            id: null,
            isDisplayed: false,
            headline: null,
            message: null,
            cover: null
        },

        hasMatching: false,                 //has a movie match
        matchingMovie: null,                //matching movie info

        activeMode: null,                   //voting or randomizing

        genres: [],
        selectedGenreKey: null,

        movieLengthCategories: [
            { label: 'Any Movie Length', duration: { min: 0, max: Infinity } },
            { label: 'Short Films (up to 1h 45m)', duration: { min: 0, max: 105 * 60 } },
            { label: 'Standard Films (1h 45m to 2h 15m)', duration: { min: 106 * 60, max: 135 * 60 } },
            { label: 'Long Films (2h 15m to 2h 45m)', duration: { min: 136 * 60, max: 165 * 60 } },
            { label: 'Epic Films (over 2h 45m)', duration: { min: 166 * 60, max: Infinity } }
        ],
        selectedDuration: null,

        watchlist: [],
        currentMovie: null,
        moviesForRng: [],

        async init() {
            this.selectedDuration = this.movieLengthCategories[0].duration;

            try {
                this.genres = await api.fetchGenres();
                this.isLoadingGenres = false;
                this.genres = [{ label: 'Any Genre', key: 'any' }, ...this.genres];
                this.selectedGenreKey = this.genres[0].key;
                this.watchlist = await api.fetchAllMovies();
            } catch (error) {
                console.error('Error:', error);
            }
        },

        async loadMoviesFromWatchlist() {
            this.isLoadingWatchlist = true;
            let watchlist = [];
            let offset = 0;
            const limit = 20;

            try {
                while (true) {
                    const response = await api.fetchPlexWatchlist(offset, this.selectedGenreKey, this.selectedDuration);
                    const { size, movies } = response;

                    watchlist = [...watchlist, ...movies];
                    console.log(`Fetched ${size} items starting from offset ${offset}`);

                    if (size === 0 || size < limit) {
                        const saveResponse = await api.saveWatchlist(watchlist);
                        const { watchlist: updatedWatchlist } = await saveResponse.json();
                        this.watchlist = updatedWatchlist;
                        console.log('All items fetched.');
                        break;
                    }
                    offset += Number(size);
                }
            } catch (error) {
                console.error('Error:', error);
            } finally {
                this.isLoadingWatchlist = false;
            }
        },

        async startRandomizing() {
            this.watchlist = await api.fetchAllMovies();
            this.moviesForRng = [...this.watchlist];
            this.getRandomMovie();
        },

        async getRandomMovie() {
            this.activeMode = 'randomizing';
            this.isLoadingMovie = true;
            try {
                if (this.moviesForRng.length === 0) {
                    this.moviesForRng = [...this.watchlist];
                }

                if (this.moviesForRng.length === 0) {
                    throw new Error('No movies available to select.');
                }

                const randomIndex = Math.floor(Math.random() * this.moviesForRng.length);
                const [selectedMovie] = this.moviesForRng.splice(randomIndex, 1);

                this.currentMovie = await api.fetchMovieDetails(selectedMovie.guid);
                this.currentMovie.id = selectedMovie.id;

                window.scrollTo(0, 0);
            } catch (error) {
                console.error('Error getting random movie:', error);
                throw error;
            } finally {
                this.isLoadingMovie = false;
            }
        },

        async resetVotes() {
            await api.resetVotes();
            this.watchlist = await api.fetchAllMovies();
        },

        /* start or resume voting */

        async initiateOrResumeVoting() {
            this.activeMode = 'voting';
            try {
                const match = await this.getFirstMatchingMovie();
                if (match?.guid) {
                    this.setEndOfVotesInfo(match.guid);
                    return;
                }

                this.watchlist = await api.fetchAllMovies();
                await this.handleExistingLocalStorage();

            } catch (error) {
                console.error('Error fetching current movie:', error);
                throw error;
            } finally {
                this.isLoadingMovie = false;
            }
        },

        async handleExistingLocalStorage() {
            try {
                const localMovieId = Number(localStorage.getItem('currentMovieId'));
                const currentMovieFromCookie = this.watchlist.find(movie => movie.id === localMovieId);
                const hasCompletedVoting = Number(localStorage.getItem('hasCompletedVoting'));

                if (currentMovieFromCookie) {
                    if (hasCompletedVoting) { // votes already over
                        this.setEndOfVotesInfo();
                    } else { // display current movie from localStorage
                        await this.fetchAndSetCurrentMovie(currentMovieFromCookie.guid, currentMovieFromCookie.id);
                    }
                } else { // delete old useless localStorage and start new vote
                    console.log('deleting all localStorage');

                    ['currentMovieId', 'hasCompletedVoting', 'hasUpvote'].forEach(id => localStorage.removeItem(id));

                    const { guid, id } = this.watchlist[0];
                    await this.fetchAndSetCurrentMovie(guid, id);
                    localStorage.setItem('currentMovieId', id);
                }
            } catch (error) {
                console.error('Error handling existing local storage:', error);
            }
        },

        async vote(voteType) {
            const { id: movieId } = this.currentMovie;
            this.isLoadingMovie = true;

            try {
                if (voteType > 0) {
                    localStorage.setItem('hasUpvote', true);
                }
                await api.vote(movieId, voteType);
                await this.getNextMovie();
            } catch (error) {
                console.error('Error voting:', error);
            } finally {
                this.isLoadingMovie = false;
                window.scrollTo(0, 0);
            }
        },

        async getNextMovie() {
            try {
                const match = await this.getFirstMatchingMovie();
                if (match?.guid) {
                    this.setEndOfVotesInfo(match.guid);
                    return;
                }

                let url = `${API_URL}/next`;
                this.watchlist = await api.fetchAllMovies(); //TODO: not needed is already loaded?

                const currentMovieId = Number(localStorage.getItem('currentMovieId'));
                const currentMovieFromCookie = this.watchlist.find(movie => movie.id === currentMovieId);
                if (currentMovieFromCookie) {
                    url += `?currentMovieId=${currentMovieFromCookie.id}`;
                }

                const response = await fetch(url);
                switch (response.status) {
                    case 204:
                        await this.handleNoMoreMovies();
                        break;
                    case 200:
                        const movie = await response.json();
                        await this.handleNextMovie(movie);
                        break;
                    default:
                        const errorText = await response.text();
                        console.error(`Error getting next movie ${response.status}: ${errorText}`);
                }
            } catch (error) {
                console.error('Error fetching next movie:', error);
            } finally {
                this.isLoadingMovie = false;
            }
        },

        async handleNoMoreMovies() {
            try {
                localStorage.setItem('hasCompletedVoting', 1);
                this.currentMovie = null;
                this.setEndOfVotesInfo();
            } catch (error) {
                console.error('Error handling no more movies:', error);
            }
        },

        async handleNextMovie(movie) {
            try {
                await this.fetchAndSetCurrentMovie(movie.guid, movie.id);
                localStorage.setItem('currentMovieId', this.currentMovie.id);
            } catch (error) {
                console.error('Error handling next movie:', error);
            }
        },

        async getFirstMatchingMovie() {
            try {
                const matchingMovies = await api.fetchMatchingMovies();
                return matchingMovies[0]
            } catch (error) {
                console.error('Error getting first matching movie:', error);
            }
        },

        async setEndOfVotesInfo(movieGuid) {
            try {
                if (movieGuid) { // display matching movie
                    const { images: { snapshot, background, coverPoster }, title } = await api.fetchMovieDetails(movieGuid);
                    matchingInfo.cover = snapshot || background;
                    matchingInfo.poster = coverPoster;
                    matchingInfo.title = title;

                    this.endOfVotesInfo = { ...matchingInfo };
                    this.currentMovie = null;
                } else {
                    // Determine the appropriate end of votes info
                    const hasUpvote = localStorage.getItem('hasUpvote');
                    if (!hasUpvote) {
                        this.endOfVotesInfo = { ...noUpvotesInfo };
                    } else {
                        const canMatch = await api.canMatch();
                        this.endOfVotesInfo = canMatch
                            ? { ...waitingInfo }
                            : { ...noMatchingInfo };
                    }
                }
            } catch (error) {
                console.error('Error setting End of Votes information:', error);
            }
        },

        async fetchAndSetCurrentMovie(guid, id) {
            this.isLoadingMovie = true;

            try {
                const movieDetails = await api.fetchMovieDetails(guid);
                this.currentMovie = { ...movieDetails, id };
            } catch (error) {
                console.error('Error fetching movie details:', error);
            }
        },

        async restartVoting() {
            try {
                this.endOfVotesInfo.isDisplayed = false;
                await this.resetVotes();
                await this.initiateOrResumeVoting();
            } catch (error) {
                console.error('Error restarting voting:', error);
            }
        },

        async restartUserVoting() {
            try {
                ['currentMovieId', 'hasCompletedVoting'].forEach(id => localStorage.removeItem(id));
                //TODO: check if votes have been reset in the meantime (very rare)
                await api.decrementDownvotes();
                await this.initiateOrResumeVoting();
                this.endOfVotesInfo.isDisplayed = false;

            } catch (error) {
                console.error('Error restarting user voting:', error);
            }
        },

        /* Format functions for display */

        stringifyDuration(duration) {
            return JSON.stringify({
                min: duration.min,
                max: isFinite(duration.max) ? duration.max : 'Infinity'
            });
        },
        parseDuration(str) {
            const obj = JSON.parse(str);
            return {
                min: obj.min,
                max: obj.max === 'Infinity' ? Infinity : obj.max
            };
        },
        selectDuration(event) {
            this.selectedDuration = JSON.parse(event.target.value);
        },
        formatDuration(duration) {
            const seconds = Math.floor(duration / 1000);
            const minutes = Math.floor(seconds / 60);
            const hours = Math.floor(minutes / 60);
            const remainingMinutes = minutes % 60;

            if (minutes < 60) {
                return `${minutes} min`;
            } else {
                return `${hours} hr ${remainingMinutes} min`;
            }
        },
        getRatingIcon({ source, icon }) {
            const iconMap = {
                imdb: "assets/icons/imdb.svg",
                themoviedb: "assets/icons/tmdb.svg",
                rottentomatoesCritic: {
                    ripe: "assets/icons/redtomatoe.svg",
                    rotten: "assets/icons/rottentomatoe.svg"
                },
                rottentomatoesAudience: {
                    upright: "assets/icons/redpopcorn.svg",
                    spilled: "assets/icons/greenpopcorn.svg"
                }
            };

            const sourceIcons = iconMap[source];
            return typeof sourceIcons === 'string' ? sourceIcons : sourceIcons?.[icon] || '';
        },
        getRatingLabel({ source, value }) {
            return source === "imdb" ? `${value}/10` : `${Math.round(value * 10)}%`;
        }
    }
};