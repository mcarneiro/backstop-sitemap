const url = require('url');
const path = require('path');
const fs = require('fs');
const jar = require('request').jar();
const request = require('request').defaults({jar: jar});
const cheerio = require('cheerio');
const config = require('./config');

const req = (obj) => new Promise((ok, fail) => {
	const req = request(obj, (err, res, body) => {
		err ? fail(err) : ok({req: req, res: res, body: body});
	});
});

const uniq = (label, arr) => {
	var labels = [];
	return arr.filter(elm => labels.indexOf(elm[label]) < 0 ? !!labels.push(elm[label]) : false);
};

const loadJSON = (path, def) => {
	try {
		return JSON.parse(fs.readFileSync(path));
	} catch(e) {
		return def || {};
	}
};

const backstop = loadJSON(path.normalize('template/backstop.json'));
var cookies = loadJSON(path.normalize('template/cookies.json'), []);

const getLinks = body => {
	const $ = cheerio.load(body);
	var l = $(config.linkSelector).map((i, elm) => ({
		label: $(elm).text().replace(/\s+/g,'') || $(elm).attr('href'),
		href: $(elm).attr('href')
	})).get();

	return uniq('href', l)
		.filter(elm => /^[^#]/.test(elm.href));
};

(config.loginUri ? req({
	uri: url.resolve(config.url, config.loginUri),
	method: 'post',
	formData: config.loginPostData
}) : Promise.resolve())
.then(() => req({
	uri: url.resolve(config.url, config.sitemapUri)
}))
.then(data => {
	const sessionCookies = jar.getCookies(config.url).map(cookie => cookie.toJSON());
	const l = getLinks(data.body);

	backstop.scenarios = l
		.map(elm => {
			const label = elm.label.trim() || elm.href;
			const override = backstop.scenarios.filter(elm => elm.label === label)[0] || {};
			return Object.assign({}, backstop.baseScenario, {
				label: label,
				url: url.resolve(url.resolve(config.url, data.req.uri.pathname), elm.href)
			}, override);
		})
		.filter(elm => !config.removeList.reduce((a, b) => a || !!elm.url.match(b), false));
		
	console.log('\nFound links: \n ', backstop.scenarios.map(elm => elm.url).join('\n  '), '\n');

	cookies = cookies.concat(sessionCookies.map(cookie => ({
		name: cookie.key,
		value: cookie.value
	}))).map(elm => Object.assign(elm, {
		domain: url.parse(config.url).hostname
	}));

	fs.writeFileSync('cookies.json', JSON.stringify(cookies, null, 2), 'utf8');
	fs.writeFileSync('backstop.json', JSON.stringify(backstop, null, 2), 'utf8');

	console.log('cookies.json and backstop.json generated.');
})
.catch(err => console.log(err));