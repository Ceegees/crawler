var request = require('request');
var cheerio = require('cheerio');
var URL = require('url-parse');

const Sequelize = require('sequelize');
const sequelize = new Sequelize('a','b','c',{
    dialect: 'sqlite',
    storage: "db.sqlite",
    logging: false
});

const Page = sequelize.define('page', {
    url: {
        type: Sequelize.STRING,
        unique: true
    },
    fetchTime: {
        type: Sequelize.INTEGER,
        defaultValue: 0
    },
    status: {
        type: Sequelize.INTEGER,
        defaultValue: -1
    },
    jsonStore: {
        type: Sequelize.TEXT
    }
});

const PageLinks = sequelize.define('page_links', {
    source_url: {
        type: Sequelize.STRING,
        unique: 'idx_source_target_composite'
    },
    target_url: {
        type: Sequelize.STRING,
        unique: 'idx_source_target_composite'
    },
    count: {
        type: Sequelize.INTEGER,
        defaultValue: 1
    }
});

// force: true will drop the table if it already exists
Page.sync().then(() => {
    // Table created
});

PageLinks.sync().then(()=> {
});

console.log(process.argv);

if (process.argv.length < 3) {
    console.log('Usage : node crawl http://www.domain.com');
    // exit();
    process.exit();
}
var START_URL = process.argv[2];

var url = new URL(START_URL);
var baseUrl = url.protocol + "//" + url.hostname;

// crawl();

Page.count().then(c=> {
    console.log('Page Total Page Count ', c);
    if (c == 0) {
        Page.create({
            url: baseUrl
        }).then(function () {
            crawl();
        });
    } else {
        crawl();
    }
})

function crawl() {
    Page.find({
        where: {
            status: -1
        }
    }).then(page=> {
        if (!page) {
            console.log('PROCESSING OVER');
            return;
        }
        console.log('fetching ', page.get('url'));
        page.set('status', 0);
        page.save().then(function () {
            visitPage(page, crawl);
        });
    });
}

function normalizePath(path) {
    return baseUrl + path;
}

function addLinksToDB(source,list,callback) {
    var target = list.pop();
    if (!target) {
        callback();
        return;
    }

    Page.findOrCreate({
        where: {
            url: target
        },
        defaults: {
            url: target
        }
    }).spread((page,createdPage) => {
            PageLinks.findOrCreate({
                where: {
                    source_url: source,
                    target_url: target
                }
            }).spread((link,createdLink)=> {
                if (link) {
                    link.set('count', link.get('count') + 1);
                    link.save().then(function () {
                        addLinksToDB(source, list, callback);
                    })
                } else {
                    addLinksToDB(source, list, callback);
                }
            });

        });
}

function visitPage(page, callback) {
    request({url: page.get('url'),time: true}, function (error, response, body) {
        // Check status code (200 is HTTP OK)
        page.set('status', response.statusCode);
        page.set('fetchTime', response.elapsedTime)
        page.save();
        // console.log(response);

        console.log("Status code: " + response.statusCode, " tm:", response.elapsedTime);

        if (response.statusCode !== 200) {
            callback();
            return;
        }
        // Parse the document body
        var $ = cheerio.load(body);
        var list = collectInternalLinks($);
        addLinksToDB(page.get('url'), list, callback);
    });
}

function collectInternalLinks($) {
    var relativeLinks = $("a[href^='/']");
    var list = [];
    relativeLinks.each(function () {
        list.push(normalizePath($(this).attr('href')));
    });
    return list;
}
