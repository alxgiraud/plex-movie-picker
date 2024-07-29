const express = require('express');
const router = express.Router();
const db = require('../db/db.js');

// Initialize the database at server start
db.initializeDb().catch(err => {
    console.error('Failed to initialize database:', err.message);
});

router.get('/movies', async (req, res) => {
    try {
        const movies = await db.getAllMovies();

        res.status(200).json(movies);
    } catch (err) {
        console.error('Error getting movies:', err.message);
        res.status(500).json({ error: 'Failed to retrieve movies.' });
    }
});

router.post('/movies/overwrite', async (req, res) => {
    try {
        const movies = req.body.movies;

        if (!movies || !Array.isArray(movies)) {
            return res.status(400).json({ error: 'Invalid request. Expecting an array of movies.' });
        }

        await db.clearMovies();

        const insertedRecords = [];
        for (const movie of movies) {
            const { guid, title } = movie;
            const insertedRecord = await db.insertMovie(guid, title);
            insertedRecords.push(insertedRecord);
        }

        res.status(201).json({ message: 'Movies inserted successfully.', watchlist: insertedRecords });
    } catch (err) {
        console.error('Database operation failed:', err.message);
        res.status(500).json({ error: 'Database operation failed.' });
    }
});

router.get('/movies/next', async (req, res) => {
    try {
        const currentMovieId = req.query.currentMovieId;
        const nextMovie = await db.getNextMovie(currentMovieId);

        if (!nextMovie) {
            return res.status(204).send(); // No Content
        }
        res.status(200).json(nextMovie);
    } catch (err) {
        console.error('Error getting next movie:', err.message);
        res.status(500).json({ error: 'Failed to retrieve next movie.' });
    }
});

router.patch('/movies/reset', async (req, res) => {
    try {
        const result = await db.resetVotes();
        res.status(200).json(result);
    } catch (err) {
        console.error('Error resetting votes:', err.message);
        res.status(500).json({ error: 'Failed to reset votes.' });
    }
});

router.post('/movies/:id/vote', async (req, res) => {
    try {
        const movieId = req.body.movieId;
        const voteType = req.body.voteType;

        if (voteType !== 1 && voteType !== -1) {
            return res.status(400).json({ error: 'Invalid vote type. Must be 1 (upvote) or -1 (downvote).' });
        }

        await db.vote(movieId, voteType);

        res.status(200).json({ message: 'Vote done successfully.' });
    } catch (err) {
        console.error('Failed to vote:', err.message);
        res.status(500).json({ error: 'Failed to vote.' });
    }
});

router.get('/movies/votes-above/1', async (req, res) => {
    try {
        const rows = await db.checkVotes();
        res.json({ data: rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/movies/can-match', async (req, res) => {
    try {
        const movieCount = await db.getMovieCount();
        const votesSum = await db.getVotesSum();

        const threshold = movieCount * 2; //NOTE: update 2 by #user for more than 2 users voting
        const isMatchPossible = votesSum < threshold;

        res.json({
          matchPossible: isMatchPossible,
          votesSum,
          threshold,
        });
      } catch (error) {
        res.status(500).json({ error: 'Error checking if it can match' });
    }
});

router.post('/movies/decrement-downvotes', async (req, res) => {
    try {
        await db.decrementDownvotes();
        res.status(200).json({ message: 'Downvotes decremented' });
    } catch (error) {
        res.status(500).json({ error: 'Error decrementing downvotes' });
    }
});

module.exports = { router };
