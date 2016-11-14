// Description:
//   Rock it!
//
// Dependencies:
//
// Configuration:
//
// Commands:
//
// Notes:
//
// Author:
//     tahoemph@gmail.com

var config = require('../config');
var moment = require('moment-timezone');
var request = require('request');

function _sendMessage(message, robot, rooms, userRequest) {
  if (userRequest) {
    userRequest.reply(message);
  } else {
    for (var j = 0; j < rooms.length; j++) {
      robot.messageRoom(rooms[j], message);
    }
  }
}

function checkStatusRepo(robot, repo, rooms, userRequest) {
  request("https://api.buildkite.com/v2/organizations/" + process.env.BUILDKITE_ORGANIZATION +
      "/pipelines/" + repo + "/builds?branch=master&access_token=" +
      process.env.BUILDKITE_ACCESS_TOKEN,
      function(err, res, body) {
        if (err) {
          console.log("http returned " + err + " status: " + res.statusCode);
        }
        actions = JSON.parse(body);
        if (actions.message === "Not Found") {
          if (userRequest) {
            userRequest.reply("Didn't find repo " + repo);
          } else {
            console.log("got request for non existent repo " + repo);
          }
          return;
        }
        var last_build, last_release;
        for (var actionInd = 0; actionInd < actions.length; actionInd++) {
          action = actions[actionInd];
          if (!('jobs' in action)) {
            continue;
          }
          if (action.commit === 'HEAD') {
            continue;
          }
          jobs = action.jobs;
          for (var jobInd = 0; jobInd < jobs.length; jobInd++) {
            job = jobs[jobInd];
            if (job.type === 'manual' &&
                endsWith(job.label, 'prod.saymedia.com')) {
              last_build = last_build || action.commit;
              if (jobs[jobInd+1].finished_at) {
                last_release = action.commit;
              }
            }
            if (last_build && last_release) {
              break;
            }
          }
          if (last_build && last_release) {
            break;
          }
        }
        if (last_build !== last_release) {
          var reply =
              "Outstanding " + repo + " work ready to be released: " +
              "https://" + process.env.BEANSTALK_DOMAIN + "/" + repo + "/compare?ref=c-" + last_release +
              "&target=c-" + last_build;
          _sendMessage(reply, robot, rooms, userRequest);
        } else if (userRequest) {
          userRequest.reply("nothing to update for " + repo);
        }
      }
  );
}

function checkStatusRepos(robot) {
  var now = new Date();
  // Don't whine on the weekends.
  if (now.getUTCDay() === 6 || now.getUTCDay() === 0) {
	console.log("skipped weekend");
    return;
  }
  for (var i = 0; i < config.deploys.length; i++) {
    checkStatusRepo(robot, config.deploys[i].repo, config.deploys[i].rooms);
  }
}

function calculateWakeup(hour, minute) {
  var now = new Date();
  var localNow = moment.utc(now).tz("America/Los_Angeles");
  var hours = hour - localNow.hour();
  var minutes = minute - localNow.minute();
  var delta = hours*60 + minutes;
  if (delta <= 0) {
    delta += 24*60;
  }
  console.log("waking up in " + delta + " minutes");
  return delta*60*1000;
}

function scheduleCheckStatusRepos(robot) {
  setTimeout(function() {
    checkStatusRepos(robot);
    scheduleCheckStatusRepos(robot);
  }, calculateWakeup(9, 30));
}

function endsWith(src, target) {
    if (target.length > src.length) {
        return false;
    }
    return src.slice(-target.length) == target;
}

function _requestReviews(reviewList, repo, page, doneCallback) {
    page = page || 1;
    requestUrl = 'https://' + process.env.BEANSTALK_DOMAIN + '/api/code_reviews.json';
    options = {
        'auth': {
            'user': process.env.BEANSTALK_USER,
            'pass': process.env.BEANSTALK_PASS
        },
        'url': requestUrl,
        'Content-Type': 'application/json',
        'User-Agent': process.env.BEANSTALK_UA,
        'status': 'pending',
        'qs': {
            'page': page
        }
    };
    request(options, function(err, res, body) {
        if (err) {
            console.log("request err: " + err);
            doneCallback(reviewList);
            return;
        }
        var reviewers, url, review, info;
        var reviews = JSON.parse(body);
        for (var reviewInd = 0;
                reviewInd < reviews.code_reviews.length;
                reviewInd++) {
            review = reviews.code_reviews[reviewInd];
            if (review.repository.name !== repo) {
                continue;
            }
            if (review.state === 'approved' || review.state === 'cancelled') {
                continue;
            }
            url = 'https://' + process.env.BEANSTALK_DOMAIN + '/' +
                review.repository.name + '/code_reviews/' + review.id;
            reviewers = [];
            for (var i = 0; i < review.assigned_users.length; i++) {
                reviewers.push(review.assigned_users[i].login);
            }
            info = {
                'url': url,
		'description': review.description,
                'requester': review.requesting_user.login, 
                'reviewers': reviewers,
                'state': review.state,
                'repo': review.repository.name,
                'id': review.id
            };
            reviewList.push(info);
        }
        // Did we get them all or did we at least get enough?
        if (reviews.total_pages < page || reviewList.length > 10 || (reviewList.length > 0 && page > 10)) {
            doneCallback(reviewList);
        } else {
            _requestReviews(reviewList, repo, page + 1, doneCallback);
        }
    });
}

function checkReviewsRepo(robot, repo, rooms, userRequest) {
  _requestReviews([], repo, undefined, function(reviews) {
      if (reviews.length === 0) {
	  if (userRequest) {
            userRequest.send('no open reviews for ' + repo);
          }
          return;
      }
      var review, statement;
      for (var reviewInd = 0; reviewInd < reviews.length; reviewInd++) {
          review = reviews[reviewInd];
          statement = review.url + " " + review.description + " " +
	    " (owner: " + review.requester +
            " reviewers: " + review.reviewers.join(',') + ")";
          _sendMessage(statement, robot, rooms, userRequest);
      }
  });
}

function checkReviews(robot) {
  var now = new Date();
  // Don't whine on the weekends.
  if (now.getUTCDay() === 6 || now.getUTCDay() === 0) {
	console.log("skipped weekend");
    return;
  }
  for (var i = 0; i < config.reviews.length; i++) {
    console.log("check " + config.reviews[i].repo);
    checkReviewsRepo(robot, config.reviews[i].repo, config.reviews[i].rooms);
  }
}

function scheduleCheckReviews(robot) {
  console.log("scheduleCheckReviews");
  setTimeout(function() {
    checkReviews(robot);
    scheduleCheckReviews(robot);
  }, calculateWakeup(9, 30));
}

module.exports = function(robot) {
  setTimeout(function() {
    scheduleCheckStatusRepos(robot);
  }, 1*1000);

  setTimeout(function() {
    scheduleCheckReviews(robot);
  }, 1*1000);

  robot.respond(/help/i, function(res) {
    var helpText = [
        "I respond to \"release <repo>\" with information about the release status of the repo.",
        "I respond to \"reviews <repo>\" with information about the code reviews for the repo.",
        "I'll whine many mornings if you havn't kept up with deploys or reviews."
    ];
    for (var i = 0; i < helpText.length; i++) {
        res.reply(helpText[i]);
    }
  });

  robot.respond(/release .*/, function(res) {
    var messageParts = res.message.text.split(' ');
    if (messageParts.length === 0) {
      return; // huh?
    }
    checkStatusRepo(robot, messageParts[messageParts.length - 1], undefined, res);
  });

  robot.respond(/reviews .*/, function(res) {
    var messageParts = res.message.text.split(' ');
    if (messageParts.length === 0) {
      return; // huh?
    }
    checkReviewsRepo(robot, messageParts[messageParts.length - 1], undefined, res);
  });
};
