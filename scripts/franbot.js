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

request = require('request');
config = require('../config');

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
          if (userRequest) {
            userRequest.reply(reply);
          } else {
	    for (var j = 0; j < rooms.length; j++) {
                robot.messageRoom(rooms[j], reply);
            }
          }
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
  for (var i = 0; i < config.length; i++) {
    checkStatusRepo(robot, config[i].repo, config[i].rooms);
  }
}

function calculateWakup() {
  // We wakeup at 16:30UTC every day.
  var now = new Date();
  var hours = 16 - now.getUTCHours();
  var minutes = 30 - now.getUTCMinutes();
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
  }, calculateWakup());
}

function endsWith(src, target) {
    if (target.length > src.length) {
        return false;
    }
    return src.slice(-target.length) == target;
}

module.exports = function(robot) {
  setTimeout(function() {
    scheduleCheckStatusRepos(robot);
  }, 1*1000);

  robot.respond(/help/i, function(res) {
    res.reply("Send me the name of a repo and I'll tell you if it needs to be released.");
    res.reply("I'll also prod you in the morning for certain repos.");
  });

  robot.respond(/.*/, function(res) {
    if (endsWith(res.message.text.toLowerCase(), "help")) {
      return;
    }
    var messageParts = res.message.text.split(' ');
    if (messageParts.length === 0) {
      return; // huh?
    }
    checkStatusRepo(robot, messageParts[messageParts.length - 1], undefined, res);
  });
};
