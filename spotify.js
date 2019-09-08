const axios = require('axios');
const express = require('express');
const querystring = require('querystring');
const FileStore = require('fs-store').FileStore;

require('dotenv').config();
const store = new FileStore('data.json');

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT = 'http://localhost:8888/callback';
const PORT = process.env.PORT || 8888;
let ACCESS, REFRESH;

REFRESH = store.get('refresh');

const app = express();

getNowPlaying();
// setIntervalImmediately(() => {
//   getNowPlaying();
// }, 10000);

app.get('/', (req, res) => {
  getNowPlaying(res);
});

app.get('/login', (req, res) => {
  var scope = 'user-read-playback-state user-modify-playback-state';
  res.redirect('https://accounts.spotify.com/authorize?' +
    querystring.stringify({
      response_type: 'code',
      client_id: CLIENT_ID,
      scope: scope,
      redirect_uri: REDIRECT,
    })
  );
});

app.get('/callback', (req, res) => {
  const code = req.query.code || null;

  const data = {
    code: code,
    redirect_uri: REDIRECT,
    grant_type: 'authorization_code',
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET
  };

  axios.post('https://accounts.spotify.com/api/token', querystring.stringify(data)).then(response => {
    ACCESS = response.data.access_token;
    REFRESH = response.data.refresh_token;
    store.set('refresh', REFRESH);

    getAccess(res);
  }).catch(err => {
    console.error(err.response);
    res.status(500).send('Error getting access token from authorization code');
  });
});

function getAccess(res, cb) {
  const data = {
    grant_type: 'refresh_token',
    refresh_token: REFRESH,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET
  };
  axios.post('https://accounts.spotify.com/api/token', querystring.stringify(data)).then(response => {
    ACCESS = response.data.access_token;
    if (res) res.redirect('/');
    if (cb) cb();
  }).catch(err => {
    console.error(err.response);
    if (res) res.status(500).send('Error getting access token from refresh token');
  })
}

function getNowPlaying(res) {
  if (ACCESS) {
    axios.get('https://api.spotify.com/v1/me/player', {
      headers: {
        Authorization: 'Bearer ' + ACCESS
      }
    }).then(response => {
      const data =  response.data;
      const info = data.is_playing ? data.item.name : 'Nothing currently playing';
      console.log(info);
      if (res) res.send(info);
    }).catch(err => {
      console.error(err.response);
      if (res) res.status(500).send('Couldn\'t get currently playing data');
    });
  } else if (REFRESH) {
    console.log('Getting access token');
    getAccess(res, () => getNowPlaying());
  } else {
    if (res) res.redirect('/login');
    console.error('Not logged in');
  }
}

function setIntervalImmediately(func, interval) {
  func();
  return setInterval(func, interval);
}

app.listen(PORT);
console.log(`Listening on ${PORT}`);