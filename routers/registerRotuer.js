const express = require('express');
const path = require('path');

const registerRouter = express.Router();

registerRouter.get('/', function (req, res) {
    res.sendFile(path.join(__dirname, '..', 'register.html'));
});

module.exports = registerRouter;