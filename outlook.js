const fs = require('fs');
const querystring = require('querystring');
const axios = require('axios');
const express = require('express');
const FileStore = require('fs-store').FileStore;
const moment = require('moment');

require('dotenv').config();
const store = new FileStore('data.json');

const CLIENT_ID = process.env.MICROSOFT_CLIENT_ID;
const CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET;
const PLUGIN = process.env.PLUGIN;
const PORT = process.env.PORT || 8889;
const REDIRECT = `http://localhost:${PORT}/callback`;
const scopes = 'offline_access calendars.read';
const ERRORS = true;

const app = express();
app.listen(PORT);
console.log(`Listening on ${PORT}`);

let ACCESS, REFRESH;
REFRESH = store.get('microsoftRefresh');

setIntervalImmediately(() => {
  getEvents();
}, 60 * 1000);

app.get('/', (req, res) => {
  getEvents(res);
});

app.get('/login', (req, res) => {
  res.redirect('https://login.microsoftonline.com/common/oauth2/v2.0/authorize?' +
    querystring.stringify({
      response_type: 'code',
      client_id: CLIENT_ID,
      scope: scopes,
      redirect_uri: REDIRECT
    })
  );
});

app.get('/callback', (req, res) => {
  console.log(req.query);
  const code = req.query.code || null;

  const data = {
    code: code,
    redirect_uri: REDIRECT,
    grant_type: 'authorization_code',
    scope: scopes,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET
  };

  axios.post('https://login.microsoftonline.com/common/oauth2/v2.0/token', querystring.stringify(data)).then(response => {
    ACCESS = response.data.access_token;
    REFRESH = response.data.refresh_token;
    store.set('microsoftRefresh', REFRESH);

    res.redirect('/');
  }).catch(err => {
    if (ERRORS) console.error(err.response || err);
    const info = 'Error getting access token from authorization code'
    res.status(500).send(info);
    updatePlugin(info);
  });
});

function getAccess(res, cb) {
  const data = {
    grant_type: 'refresh_token',
    refresh_token: REFRESH,
    scope: scopes,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET
  };
  axios.post('https://login.microsoftonline.com/common/oauth2/v2.0/token', querystring.stringify(data)).then(response => {
    ACCESS = response.data.access_token;
    if (res) res.redirect('/');
    else if (cb) cb();
  }).catch(err => {
    if (ERRORS) console.error(err.response || err);
    const info = 'Error getting access token from refresh token';
    if (res) res.status(500).send(info);
    updatePlugin(info);
  })
}

function getEvents(res) {
  if (ACCESS) {
    axios.get('https://graph.microsoft.com/v1.0/me/calendars', {
      headers: {
        Authorization: 'Bearer ' + ACCESS
      }
    }).then(response => {
      const now = moment();
      const startWeek = moment().startOf('w');
      const endWeek = moment().endOf('w');

      const data = {
        startdatetime: startWeek.format(),
        enddatetime: endWeek.format(),
        $top: 50, // 50 items per page
      };

      let p = response.data.value.map(calendar => {
        return axios.get(`https://graph.microsoft.com/v1.0/me/calendars/${calendar.id}/calendarview?` + querystring.stringify(data), {
          headers: {
            Authorization: 'Bearer ' + ACCESS,
            Prefer: 'outlook.timezone="Pacific Standard Time"'
          }
        });
      });

      axios.all(p).then(data => {
        let events = [];
        data.forEach(c => {
          c.data.value.forEach(e => {
            events.push({
              ...e,
              start: moment(e.start.dateTime),
              end: moment(e.end.dateTime)
            });
          });
        });

        // Sort results
        events = events.sort((a, b) => {
          return a.start - b.start
        });

        let next;
        events.some(e => { // .some allows for short-circuit
          // if the event hasn't quite started and has been accepted
          if (e.start.isAfter(now.add(2, 'm')) && e.showAs === 'busy') {
            next = e;
            return true;
          }
          return false;
        });

        const info = next ? next.subject + ' - ' + next.start.calendar() : 'No Upcoming Events';
        
        if (res) res.send(info);
        updatePlugin(info, events);
      }).catch(err => {
        if (ERRORS) console.error(err.response || err);
        const info = 'Couldn\'t get upcoming events';
        updatePlugin(info);
        if (res) res.status(500).send(info);
      })
    }).catch(err => {
      if (ERRORS) console.error(err.response || err);
    });
  } else if (REFRESH) {
    console.log('Getting access token');
    getAccess(res, () => getEvents());
  } else {
    if (res) res.redirect('/login');
    const info = `Not logged in, please visit http://localhost:${PORT}`;
    updatePlugin(info);
  }
}

function updatePlugin(info, data) {
  console.log(info);

  try {
    switch (PLUGIN) {
      case 'genmon':
        let file;
        if (data) {
          const startDay = moment().startOf('d');
          const endDay = moment().endOf('d');
          let tooltip = '';
          data.forEach(e => {
            if (e.start.isBetween(startDay, endDay)) {
              tooltip += `${e.subject}: (${e.start.format('h:mm')} - ${e.end.format('h:mm')})\n`;
            }
          });
          // Trim the ending newline
          tooltip = tooltip.substring(0, tooltip.length - 1);

          file = `<img>${__dirname}/icons/calendar.png</img><txt>  ${info}</txt><tool>${tooltip}</tool>`;
        } else {
          file = info;
        }
        // Fix issues with & character
        file = file.replace(/&/g,'+');

        fs.writeFileSync('./outlook', file);
        break;
      default:
        console.log(info);
        break;
    }
  } catch (err) {
    if (ERRORS) console.error(err);
  }
}

function setIntervalImmediately(func, interval) {
  func();
  return setInterval(func, interval);
}