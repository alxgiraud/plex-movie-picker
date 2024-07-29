const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');

let db;

const initializeDb = async () => {
    try {
        if (!db) {

            db = await open({
                filename: './db/database.sqlite',
                driver: sqlite3.Database
            });

            await db.exec(`
            CREATE TABLE IF NOT EXISTS movies (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guid TEXT NOT NULL,
                title TEXT NOT NULL,
                upvotes INTEGER DEFAULT 0,
                downvotes INTEGER DEFAULT 0
            )
            `);

            console.log('SQLite database connected and tables initialized.');
        }
    } catch (error) {
        console.error('Error initializing database:', error.message);
        throw error;
    }
};

const clearMovies = async () => {
    try {
        await initializeDb();
        await db.run('DELETE FROM movies');
    } catch (error) {
        throw new Error('Failed to clear movies: ' + error.message);
    }
};

const resetVotes = async () => {
    try {
        await initializeDb();
        const rowsCount = await db.all('SELECT COUNT(*) AS count FROM movies');
        const count = rowsCount[0].count;
        const rowsMovies = await db.all('SELECT id, upvotes FROM movies');
        for (const row of rowsMovies) {
            const newID = row.id + count;
            await db.run('UPDATE movies SET id = ?, upvotes = 0, downvotes = 0 WHERE id = ?', [newID, row.id]);
        }

    } catch (error) {
        throw new Error('Failed to clear movies: ' + error.message);
    }
};

const insertMovie = async (guid, title) => {
    try {
        await initializeDb();
        const result = await db.run(`
            INSERT INTO movies (guid, title, upvotes, downvotes)
            VALUES (?, ?, 0, 0)
        `, [guid, title]);
        return { id: result.lastID, guid };
    } catch (error) {
        throw new Error('Failed to insert movie: ' + error.message);
    }
}

const getAllMovies = async () => {
    try {
        await initializeDb();
        const movies = await db.all(`SELECT * FROM movies`);
        return movies;
    } catch (error) {
        throw new Error('Failed to get all movies: ' + error.message);
    }
};

const getNextMovie = async (currentMovieId) => {
    try {
        await initializeDb();

        let query = 'SELECT * FROM movies';

        if (currentMovieId) {
            query += ` WHERE id > ? ORDER BY id ASC LIMIT 1`;
            const result = await db.get(query, currentMovieId);
            return result;
        } else {
            query += ' ORDER BY id ASC LIMIT 1';
            const result = await db.get(query);
            return result;
        }
    } catch (error) {
        console.error('Error retrieving next movie:', error.message);
        throw error;
    }
};

const vote = async (movieId, vote) => {
    try {

        if (!movieId) {
            throw new Error('Movie ID is required.');
        }

        await initializeDb();

        let query = (vote > 0)
            ? 'UPDATE movies SET upvotes = upvotes + 1 WHERE id = ?'
            : 'UPDATE movies SET downvotes = downvotes + 1 WHERE id = ?';

        await db.run(query, movieId);

    } catch (error) {
        console.error('Error voting:', error.message);
        throw error;
    }
};

const checkVotes = async () => {
    try {
        await initializeDb();
        const query = 'SELECT * FROM movies WHERE upvotes > 1';
        return db.all(query);

    } catch (error) {
        console.error('Error checking votes:', error.message);
        throw error;
    }
};

const getMovieCount = async () => {
    try {
        await initializeDb();
        const query = 'SELECT COUNT(*) AS count FROM movies';
        const row = await db.get(query);
        return row.count;
    } catch (error) {
        throw new Error('Failed to get movie count: ' + error.message);
    }
};

const getVotesSum = async () => {
    try {
        await initializeDb();
        const query = 'SELECT SUM(upvotes) AS totalUpvotes, SUM(downvotes) AS totalDownvotes FROM movies';
        const row = await db.get(query);
        return row.totalUpvotes + row.totalDownvotes;
    } catch (error) {
        throw new Error('Failed to get movie count: ' + error.message);
    }
};

const decrementDownvotes = async () => {
    try {
        await initializeDb();
        const query = 'UPDATE movies SET downvotes = downvotes - 1 WHERE downvotes > 0';
        await db.get(query);
    } catch (error) {
        throw new Error('Failed to decrement downvotes: ' + error.message);
    }
}

module.exports = {
    initializeDb,
    clearMovies,
    resetVotes,
    insertMovie,
    getAllMovies,
    getNextMovie,
    vote,
    checkVotes,
    getMovieCount,
    getVotesSum,
    decrementDownvotes
};
