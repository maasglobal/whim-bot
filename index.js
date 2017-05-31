'use strict';
/**
 * Whim-Bot main handler
 * @author Sami Pippuri <sami.pippuri@maas.global>
 * @author Ville Rantala <ville.rantala@microsoft.com>
 * LICENSE: MIT
 */

const builder = require('botbuilder');
const requests = require('./requests.js');
const utils = require('./utils');

const FRONTEND_URL = process.env.BOT_FRONTEND_URL || 'https://localhost:3000';
const LOGO_URL = process.env.BOT_LOGO_URL;
const WHIM_BOOKED_PIC = process.env.WHIM_BOOKED_PIC;
const WHIM_BOOKED_URL = process.env.WHIM_BOOKED_URL;
const FIRST_FACTOR_URL = FRONTEND_URL + '/index.html';
const SECOND_FACTOR_URL = FRONTEND_URL + '/factor2.html';
const MIN_LOCATION_CHARS = 3;

if (!process.env.WHIM_API_KEY) {
  console.log('ERROR: Environment doesnt seem to be properly set');
}
const connector = new builder.ChatConnector({
  appId: process.env.MICROSOFT_APP_ID,
  appPassword: process.env.MICROSOFT_APP_PASSWORD
});

const bot = new builder.UniversalBot(connector);
const listener = connector.listen();
const intents = new builder.IntentDialog();

intents.matches('cancel', '/cancel');
intents.matches('quit', '/cancel');
intents.matches('exit', '/cancel');
intents.matches('help', '/help');
intents.matches('hi', '/help');
intents.matches('hi!', '/help');
intents.matches('hello', '/help');

const fetchProfileFavorites = token => {
  return new Promise( (resolve, reject) => {
    return requests.favorites(token)
      .then( (res) => {
      console.log('Got favorites', res);
      const arr = {};
      for (const item of res.profile.favoriteLocations) {
        arr[item.name] = {
          latitude: item.lat,
          longitude: item.lon,
          name: item.name
        };
      }
      return resolve(arr);
    });
  });
}

bot.dialog('/', intents);

bot.dialog('/persistUserData', function (session, data) {
  session.userData.user = data;
  session.endDialog();
});

bot.dialog('/cancel', session => {
  session.endConversation();
});

bot.dialog('/help', session => {
  session.send('Hi, this is the Whim Bot. First, type a location or send your current location via the Messenger app (+) menu. Then the Whim Bot will walk you through the process of selecting the destination location, and planning the trip to the destination.')
  session.endDialog('Where is your starting point?')
});

const handleAccountLinking = session => {
  console.log('handleAccountLinking', session);
  const accountLinking = session.message.sourceEvent.account_linking;
  // This is the handling for the `Account Linking webhook event` where we could
  // verify the authorization_code and that the linking was successful.
  // The authorization_code is the value we passed above and
  // status has value `linked` in case the linking succeeded.
  const username = accountLinking.authorization_code;
  const authorizationStatus = accountLinking.status;
  if (authorizationStatus === 'linked') {
    session.beginDialog('/help');
  } else if (authorizationStatus === 'unlinked') {
    // Remove user from the userData
    delete session.userData.user;
    session.endDialog('Account unlinked');
  } else {
    session.endDialog('Unknown account linking event received');
  }
};

intents.onDefault( session => {
  console.log('OnDefault', session.message);
  if (session.message.source === 'facebook') {
    if (session.message.sourceEvent.account_linking) {
      handleAccountLinking(session);
      return;
    }
    const storedUser = session.userData.user;
    if (!storedUser) {
      session.beginDialog('/welcome');
      return;
    }
    const entities = session.message.entities;
    console.log('Entities received are', entities);

    if (entities.length > 0 && entities[0].geo) {
      const geo = Object.assign({name: 'Pin Location'}, entities[0].geo)
      session.beginDialog('/options', geo);
      return;
    }
    if (session.message.text && session.message.text.length >= MIN_LOCATION_CHARS) {
      // TODO recognize natural language
      if (['quit','exit','cancel','hello','hi','hi!','yo','yo!','help','help!']
            .indexOf(session.message.text.toLowerCase()) !== -1) {
        console.log('Help wanted');
        return session.beginDialog('/help');
      }
      console.log('Searching for a place ', session.message.text)
      session.sendTyping();
      return session.beginDialog('/geosearch', session.message.text);
    }
    return session.beginDialog('/help'); //('To request a ride, please send your location');
  } else {
    session.endDialog('I am currently expecting to be called from Facebook Messenger');
  }
});

bot.dialog('/welcome', function (session) {
  console.log('Welcome presented as', FIRST_FACTOR_URL + '?address=' + JSON.stringify(session.message.address))
  var message = new builder.Message(session)
    .sourceEvent({
      facebook: {
        attachment: {
          type: 'template',
          payload: {
            template_type: 'generic',
            elements: [{
              title: 'Welcome to Whim Bot',
              subtitle: 'Please log in with your Whim account',
              image_url: process.env.LOGO_URL || 'http://whimapp.com/wp-content/uploads/2017/03/whim.jpg',
              buttons: [{
                type: 'account_link',
                url: FIRST_FACTOR_URL + '?address=' + JSON.stringify(session.message.address)
              }]
            }]
          }
        }
      }
    });
  session.endDialog(message);
});

bot.dialog('/geosearch', [
  (session, text) => {
    requests.geocode(text, 60.169, 24.938, session.userData.user.id_token).then( (results) => {
        const location = utils.filterGeoCollection(results);
        console.log('Results from search are', results, 'filtered as', location);
        if (!location) return Promise.reject('Could not find location');
        const googleURL = `https://maps.googleapis.com/maps/api/staticmap?center=${location.latitude},${location.longitude}&size=480x480&zoom=12&markers=${location.latitude},${location.longitude}`
        console.log('Requesting a static map from', googleURL);
        const message = new builder.Message(session)
            .sourceEvent({
              facebook: {
                attachment: {
                  type: 'template',
                  payload: {
                    template_type: 'generic',
                    elements: [{
                      title: location.name,
                      image_url: googleURL,
                    }]
                  }
                }
              }
            });
    
        session.send(message);
        
        session.dialogData.location = location;
        builder.Prompts.choice(session,
          `Use ${location.name} as starting point?`,
          {
            OK: session.dialogData.location,
            Retry: {},
          },
          {
            maxRetries: 0
          });
      })
      .catch( err => {
        session.endDialog('Could not find that location');
      } );
  },
  (session, options) => {
    if (!options.response) {
      return session.endDialog('Please make a selection');
    }
    if (options.response.index !== 0) {
      return session.endDialog('Ok, please specify a location again.')
    }
    // TODO send the location as a GEO object in the mean time
    session.beginDialog('/options', session.dialogData.location);
  }
]);

bot.dialog('/options', [(session, fromLocation) => {
  session.dialogData.fromLocation = fromLocation;
  session.dialogData.choices = {
    Routes: {

    },
    'Whim Car': {

    },
    Restaurants: {

    },
  };
  builder.Prompts.choice(
      session,
      `Select what to search from ${fromLocation.name}, or type something else like 'italian' or 'indian'`,
      session.dialogData.choices,
      {
        maxRetries: 0
      }
    );
},
(session, options) => {
  console.log('options were', options.response, 'and message', session.message.text);
  const param = session.dialogData.fromLocation;
  if (options.response) {
    param.kind = options.response.entity;
    switch (options.response.index) {
      case 0:
        return session.beginDialog('/location', param); 
      case 1:
        console.log('Whim Car selected');
        session.send('Sorry, still working on Whim Car');
        return session.replaceDialog('/options', param); 
        //return session.beginDialog('/whimcar', session.dialogData.fromLocation); 
      case 2:
        console.log('Moving to /food to search for', param);
        return session.beginDialog('/food', param); 
      default:
        return session.replaceDialog('/options', param); 
    }
  } else if(['quit','stop','cancel','help'].indexOf(session.message.text) != -1) {
      return session.endDialog('Ok, start over by sending a location.');
  } else {
    param.kind =  session.message.text;
    console.log('Moving to /food to search for', param);
    return session.beginDialog('/food', param); 
  }
}
]);

bot.dialog('/whimcar', [
  (session, toLocation) => {
    session.dialogData.toLocation = toLocation;
    return session.endDialog(`Sorry, Whim Car isn't yet implemented`);
  }
]);

const sendYelp = (session, choice, kind) => {
  if (!choice.rating) {
    choice.rating = '-';
  }
  if (!choice.price) {
    choice.price = '-';
  }
  const message = new builder.Message(session)
        .sourceEvent({
          facebook: {
            attachment: {
              type: 'template',
              payload: {
                template_type: 'generic',
                elements: [{
                  title: `${kind}: ${choice.name}`,
                  subtitle: `${choice.price} - ${choice.rating} Yelp rating - ${utils.kFormatter(choice.distance)} away`,
                  image_url: choice.image_url,
                  buttons: [{
                    type: 'web_url',
                    url: choice.url,
                    title: 'Visit Yelp Site'
                  }]
                }]
              }
            }
          }
        });

    session.send(message);
}

const sendBooked = (session, plan, res) => {
  console.log('Seding confirmation for the trip', plan, 'result', res);
  const message = new builder.Message(session)
        .sourceEvent({
          facebook: {
            attachment: {
              type: 'template',
              payload: {
                template_type: 'generic',
                elements: [{
                  title: `Your ride is booked! Open Whim to check its status.`,
                  image_url: `${WHIM_BOOKED_PIC}`,
                  buttons: [{
                    type: 'web_url',
                    url: `${WHIM_BOOKED_URL}`,
                    title: 'Open in Whim'
                  }]
                }]
              }
            }
          }
        });

    session.send(message);  
}

bot.dialog('/food', [
  (session, location) => {
    const kind = location.kind;
    console.log(kind, 'for location', location);
    if (!location) {
      return session.endDialog('Need to specify a location');
    }
    session.dialogData.fromLocation = location;
    session.sendTyping();
    requests.places(kind, location.latitude, location.longitude).then( (results) => {
      if (!results.businesses || results.businesses.length < 1 ) {
        return session.endDialog(`Did not find those in ${location.name}. Please try another place.`);
      }
      const choices = {};
      const nearest = utils.nearestBusiness(results.businesses);
      const choice = utils.randomBusiness(results.businesses, nearest);
      if (choice.id !== nearest.id) {
        sendYelp(session, choice, 'Random Pick');
      }
      sendYelp(session, nearest, 'Best Nearby');
      choices[`${choice.name}`] = choice;
      choices[`${nearest.name}`] = nearest;
      choices['Try again!'] = {};
      session.dialogData.choices = choices;
      builder.Prompts.choice(
          session,
          'Please select one of the options or type to search for something else nearby:',
          choices,
          {
            maxRetries: 0
          }
      );
    })
    .catch( err => {
      console.log('ERROR with yelp', err);
      return session.endDialog('Error searching, try again.');
    });
  },
  (session, options) => {
    console.log('Selection was', options, 'dialogData', session.dialogData.choices);
    if (options.response && (options.response.index >= 0) && 
        (options.response.index < (Object.keys(session.dialogData.choices).length - 1))) {
      const choice = session.dialogData.choices[options.response.entity];
      const coords = Object.assign( { name: choice.name }, choice.coordinates);
      const fromLocation = session.dialogData.fromLocation;
      fromLocation.toLocation = coords;
      return session.beginDialog('/location', fromLocation );     
    } 
    if (options.response && (options.response.index === (Object.keys(session.dialogData.choices).length - 1))) {
      return session.replaceDialog('/food', session.dialogData.fromLocation);     
    } 
    if (session.message.text === 'q' ||session.message.text === 'help' || session.message.text === 'quit') {
      return session.replaceDialog('/help');
    }
    //session.send('Ok, what else would you like to look from?');
    const loc = session.dialogData.fromLocation;
    loc.kind = session.message.text;
    return session.replaceDialog('/food', loc);     
  }
])

bot.dialog('/location', [
  function (session, fromLocation) {
    session.dialogData.fromLocation = fromLocation;
    console.log('fromLocation', fromLocation);
    //session.send(`Planning a route from ${fromLocation.name}`);
    session.sendTyping();
    if (fromLocation && fromLocation.toLocation) {
        return session.beginDialog('/destination', fromLocation);
    }
    fetchProfileFavorites(session.userData.user.id_token)
      .then( favorites => {
        console.log('Profile info', favorites);
        session.beginDialog('/destination', favorites);
      })
      .catch( err => {
        console.log('Error fetching profile', err);
        session.endDialog('Had an error while fetching favorites');
      });
  },
  function (session, results) {
    console.log('User choice for to-location', results)
    if (results.response) {
      var toLocation = results.response;
      session.dialogData.toLocation = toLocation;
      var fromLocation = session.dialogData.fromLocation;
      session.send(`Searching for routes from ${fromLocation.name} to ${toLocation.name}`);
      session.sendTyping();
      requests.routes(
        fromLocation, toLocation,
        session.userData.user.id_token).then( response => {
          session.dialogData.taxiPlan = utils.filterTaxi(response.plan.itineraries);
          session.dialogData.ptPlan = utils.filterPT(response.plan.itineraries);
          if (!session.dialogData.ptPlan && !session.dialogData.taxiPlan) {
            return session.endDialog(`Did not find routes to ${toLocation.name}`);
          }
          session.send('Found ' + response.plan.itineraries.length + ' routes');
          const topItin = session.dialogData.ptPlan;
          console.log('Itinerary', topItin);
          const choices = {};
          if (topItin) {
            choices['Public Transport'] = {};
            session.send(`Public Transport ${Math.ceil(topItin.fare.amount / 100)} pts, ${utils.calcDuration(topItin)}`);
          }
          if (session.dialogData.taxiPlan) {
            choices['TAXI'] = {};
            session.send(`Or TAXI ${Math.ceil(session.dialogData.taxiPlan.fare.amount / 100)} pts, ${utils.calcDuration(session.dialogData.taxiPlan)}`);
          }
          choices.Cancel = {};
          builder.Prompts.choice(
            session,
            `Book a ride to ${toLocation.name}?`,
            choices,
            {
              maxRetries: 0
            }
          );
        }
      );
    }
  },
  function (session, results) {
    if (results.response) {
      console.log('Response to the session is', results);
      let plan = null;
      switch (results.response.entity) {
        case 'Public Transport':
          plan = session.dialogData.ptPlan;
          break;
        case 'TAXI':
          plan = session.dialogData.taxiPlan;
          break;
        case 2:
        default:
          return session.endDialog('Ok - please send a new place');
      }
      if(plan) {
        return requests.book(plan, session.userData.user.id_token).then( res => {
          sendBooked(session, plan, res);
          session.endConversation();
          //return session.endDialog('Your ride is booked - check your <a href="whimapp://open">Whim-app!</a>');
        })
        .catch( err => {
            console.log('ERROR booking trip', err, err.stack);
            return session.endDialog('Error booking your trip');
        });
      }
    } 
    return session.endDialog('Ok. Please throw an another challenge!');
  },
]);


bot.dialog('/destination', [
  function (session, choices) {
    session.dialogData.choices = choices;
    if (choices.toLocation) {
      console.log('destination had toLocation', choices.toLocation);
      return session.endDialogWithResult({
        response: choices.toLocation
      });
    }
    builder.Prompts.choice(
      session,
      'Choose or send location to set the destination',
      choices,
      {
        maxRetries: 0
      }
    );
  },
  function (session, results) {
    console.log('Destination response', results);
    if (results.response && results.response.entity) {
      var choices = session.dialogData.choices;
      session.endDialogWithResult({
        response: choices[results.response.entity]
      });
    } else if (session.message.entities.length > 0 && session.message.entities[0].geo) {
      const geo = Object.assign({ name: 'Pin Location' }, session.message.entities[0].geo);
      session.endDialogWithResult({
        response: geo
      });
    } else if (session.message.text && session.message.text.length >= MIN_LOCATION_CHARS) {
      console.log('Searching for a place ', session.message.text)
      session.sendTyping();
      return requests.geocode(session.message.text, 60.169, 24.938, session.userData.user.id_token).then( (results) => {
        console.log('Results from search are', results);
        const location = utils.filterGeoCollection(results);
        if (!location) {
          console.log('ERROR', err);
          session.send('Did not understand the sent location - please try again');
          session.replaceDialog('/destination', session.dialogData.choices);
        } else {
          session.dialogData.location = location;
          const googleURL = `https://maps.googleapis.com/maps/api/staticmap?center=${location.latitude},${location.longitude}&size=300x300&zoom=12&markers=${location.latitude},${location.longitude}`
          console.log('Requesting a static map from', googleURL);
          const message = new builder.Message(session)
              .sourceEvent({
                facebook: {
                  attachment: {
                    type: 'template',
                    payload: {
                      template_type: 'generic',
                      elements: [{
                        title: location.name,
                        image_url: googleURL,
                      }]
                    }
                  }
                }
              });
      
          session.send(message);
                    
          builder.Prompts.choice(session,
            `Use ${location.name} as destination?`,
            {
              OK: session.dialogData.location,
              retry: {},
            },
            {
              maxRetries: 0
            });
        }
      });
    } else {
      session.send('Did not understand the sent location - please try again');
      session.replaceDialog('/destination', session.dialogData.choices);
    }
  },
  (session, options) => {
    if (!options.response) {
      return session.replaceDialog('/destination', session.dialogData.choices);
    }
    if (options.response.index !== 0) {
      return session.endDialog('Ok, please specify a location again.')
    }
   return session.endDialogWithResult({
     response: session.dialogData.location
    });
  }
]);

bot.dialog('/logout', function (session) {
  requests.unlink(session.message.address.user.id).then(response => {
      session.endDialog();
    })
    .catch( () => {
      session.endDialog('Error while unlinking account');
    });
});

// Mapping between the action `logout` (defined in `persistent-menu.json`)
// and the /logout dialog defined above.
bot.beginDialogAction('logout', '/logout');

/**
 * Login flow with FB account linking
 * 
 */



/**
 * Handler functions exported from the module
 */

// 1st and 2nd factor auth
module.exports.factors = (event, context, callback) => {
  console.log('factors', event);
  require('./factors.js')(bot, event, context)
    .then( res => { 
      console.log('Factor handler', res);
      callback(null, res);
     })
    .catch( err => { 
      console.log('ERROR', err);
      callback(null, err);
    });
}

// restify mock for lambda
module.exports.listener = (event, context, callback) => {
  console.log('Mock Listener handler called with event', event);
  const mock = require('./serverless.js')(listener);
  return mock.post(event, context, callback);
}
