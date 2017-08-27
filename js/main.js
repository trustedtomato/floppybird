const curry = fn => {
	const len = fn.length;
	const next = oldArgs => (...newArgs) => {
		const args = oldArgs.concat(newArgs);
		return (args.length >= len)
			? fn.apply(this, args)
			: next(args);
	};
	return next([]);
};

const sum = xs => xs.reduce((x,y) => x + y);

const avarage = xs => sum(xs) / xs.length;

const loadImage = (src, width, height) => new Promise((resolve, reject) => {
	const image = new Image(width, height);
	image.src = src;
	image.onload = e => resolve(image);
	image.onerror = reject;
});

const createSprite = (image, width = 1, height = 1) => {
	width = Math.floor(Number(width));
	height = Math.floor(Number(height));

	const imageWidth = image.width / width;
	const imageHeight = image.height / height;

	return Object.assign(
		width > 1 && height > 1
		? Array(width).fill(undefined).map((_,spriteX) => Array(height).fill(undefined).map((_,spriteY) =>
			(ctx,x,y) => ctx.drawImage(image, imageWidth * spriteX, imageHeight * spriteY, imageWidth, imageHeight, x, y)
		))
		: width > 1
		? Array(width).fill(undefined).map((_,spriteX) =>
			(ctx,x,y) => ctx.drawImage(image, imageWidth * spriteX, 0, imageWidth, image.height)
		)
		: height > 1
		? Array(height).fill(undefined).map((_,spriteY) =>
			(ctx,x,y) => ctx.drawImage(image, 0, imageHeight * spriteY, image.width, imageHeight, x, y, image.width, imageHeight)
		)
		: [(ctx,x,y) => ctx.drawImage(x,y)],
		{
			width: imageWidth,
			height: imageHeight
		}
	);
};

const getSilentPercents = curry((analyser, n) => new Promise(resolve => {
	const silentPercents = [];
	(function loop(){
		const frequencyData = new Uint8Array(analyser.frequencyBinCount);
		analyser.getByteFrequencyData(frequencyData);
		silentPercents.push(avarage(frequencyData) / 255);
		if(silentPercents.length >= n){
			resolve(silentPercents);
			return;
		}
		requestAnimationFrame(loop);
	}());
}));

const getShoutPercents = curry((analyser, silentThreshold) => new Promise(resolve => {
	const shoutPercents = [];
	let active = false;
	(function loop(){
		const frequencyData = new Uint8Array(analyser.frequencyBinCount);
		analyser.getByteFrequencyData(frequencyData);
		const percent = avarage(frequencyData) / 255;
		if(percent > silentThreshold){
			active = true;
			shoutPercents.push(percent);
		}else if(active){
			resolve(shoutPercents);
			return;
		}
		requestAnimationFrame(loop);
	}());
}));



(async function(){
	const splash = document.getElementById('splash');
	const canvas = document.querySelector('canvas');
	const pointCounter = document.getElementById('point-counter');
	canvas.width = window.innerWidth;
	canvas.height = window.innerHeight;
	const ctx = canvas.getContext('2d');

	// Loading images
	console.log('Loading images...');
	const birdImage = await loadImage('assets/bird.png');
	const smallFont = await Promise.all([
		loadImage('assets/font_small_0.png'),
		loadImage('assets/font_small_1.png'),
		loadImage('assets/font_small_2.png'),
		loadImage('assets/font_small_3.png'),
		loadImage('assets/font_small_4.png'),
		loadImage('assets/font_small_5.png'),
		loadImage('assets/font_small_6.png'),
		loadImage('assets/font_small_7.png'),
		loadImage('assets/font_small_8.png'),
		loadImage('assets/font_small_9.png')
	]);
	const bigFont = await Promise.all([
		loadImage('assets/font_big_0.png'),
		loadImage('assets/font_big_1.png'),
		loadImage('assets/font_big_2.png'),
		loadImage('assets/font_big_3.png'),
		loadImage('assets/font_big_4.png'),
		loadImage('assets/font_big_5.png'),
		loadImage('assets/font_big_6.png'),
		loadImage('assets/font_big_7.png'),
		loadImage('assets/font_big_8.png'),
		loadImage('assets/font_big_9.png')
	]);
	const [pipeDownImage, pipeUpImage, pipeImage] = await Promise.all([
		loadImage('assets/pipe-down.png'),
		loadImage('assets/pipe-up.png'),
		loadImage('assets/pipe.png')
	]);
	const skyImage = await loadImage('assets/sky.png');
	const landImage = await loadImage('assets/land.png');
	console.log('Loaded images!');

	// Loading sounds
	console.log('Loading sounds...');
	const pointSfx = new Audio('assets/sounds/sfx_point.ogg');
	const wingSfx = new Audio('assets/sounds/sfx_wing.ogg');
	const dieSfx = new Audio('assets/sounds/sfx_die.ogg');
	const hitSfx = new Audio('assets/sounds/sfx_hit.ogg');
	const swooshingSfx = new Audio('assets/sounds/sfx_swooshing.ogg');
	console.log('Loaded sounds!');

	// Initalizing images
	const landPattern = ctx.createPattern(landImage, 'repeat-x');
	const pipePattern = ctx.createPattern(pipeImage, 'repeat-y');
	const skyPattern = ctx.createPattern(skyImage, 'repeat-x');
	const birdSprite = createSprite(birdImage, 1, 4);
	const setPoint = (el,point,big) => {
		while(el.firstChild){
			el.removeChild(el.firstChild);
		}
		const digits = String(point).split('');
		for(const digit of digits){
			el.appendChild((big ? bigFont : smallFont)[digit].cloneNode(true));
		}
	};

	// Creating variables which will exist forever
	let analyserPromise;

	const playGame = () => new Promise(async (resolve, reject) => {
		
		// Creating game variables
		const gravity = 0.2;
		let speed = 2;
		let distance = 0;

		const bird = {
			x: 60,
			y: (canvas.height - landImage.height - birdImage.height / 4) / 2,
			rotation: 0,
			speedY: 0
		};
		let counter = 0;
		let analyser;

		const pipes = [];
		const pipeFrequency = canvas.height / 3;
		let holeSize = birdImage.height / 4 * 4;

		if(typeof analyserPromise === 'undefined'){
			analyserPromise = new Promise((resolve,reject) => {
				console.log('Requesting microphone...');
				navigator.mediaDevices.getUserMedia({audio: {
					autoGainControl: false,
					noiseSuppression: false,
					
				}}).then(stream => {
					const audioCtx = new AudioContext();
					const analyser = audioCtx.createAnalyser();
					const source = audioCtx.createMediaStreamSource(stream);
					source.connect(analyser);
					resolve(analyser);
					console.log('Got microphone!');
				});
			});
		}

		analyserPromise.then(x => {
			analyser = x;
		});

		let threshold, dynamicThreshold, maxDifference;
		analyserPromise.then(async analyser => {
			const silentPercents = await getSilentPercents(analyser, 100);
			const silentThreshold = Math.max(...silentPercents) * 1.5;
			
			splash.style.top = bird.y - 100;
			splash.setAttribute('aria-hidden','false');
			const shoutPercents = await getShoutPercents(analyser, silentThreshold);
			splash.setAttribute('aria-hidden','true');
			
			const maxShoutValue = Math.max(...shoutPercents);
			dynamicThreshold = threshold = avarage([maxShoutValue, silentThreshold]);
		});

		let lastPercent = 0;
		let ended = false;
		let endRotation;
		let point = 0;
		setPoint(pointCounter, point, true);

		(function loop(){

			if(!ended){
				distance += speed;
				counter++;
			}
			ctx.clearRect(0, 0, canvas.width, canvas.height);
			
			// Adding point
			if(analyser && threshold && !ended){
				const startPipeIndex = Math.floor((distance - speed - canvas.width + bird.x) / pipeFrequency);
				const endPipeIndex = Math.floor((distance - canvas.width + bird.x) / pipeFrequency);
				if(startPipeIndex > 0){
					const newPoints = endPipeIndex - startPipeIndex;
					if(newPoints > 0){
						pointSfx.currentTime = 0;
						pointSfx.play();
						point += newPoints;
						setPoint(pointCounter, point, true);
					}
				}
			}

			// Generating new pipes
			if(analyser && threshold){
				const startPipeIndex = Math.floor((distance - speed) / pipeFrequency);
				const endPipeIndex = Math.floor(distance / pipeFrequency);
				for(let i = startPipeIndex + 1; i <= endPipeIndex; i++){
					pipes.push({
						x: i * pipeFrequency + canvas.width,
						holeY: Math.floor(Math.random() * (canvas.height - landImage.height - pipeUpImage.height - pipeDownImage.height - holeSize)) + pipeDownImage.height,
						holeH: holeSize
					});
				}
			}

			// Flappy bird falling
			if(analyser && threshold){
				bird.speedY += gravity;
				bird.y += bird.speedY;
			}

			// Flappy bird flying
			let percent;
			if(analyser && threshold && !ended){
				const frequencyData = new Uint8Array(analyser.frequencyBinCount);
				analyser.getByteFrequencyData(frequencyData);
				percent = avarage(frequencyData) / 255;
				if(percent > threshold){
					if(lastPercent > percent){
						dynamicThreshold = percent;
					}else if(lastPercent < percent && dynamicThreshold < percent){
						wingSfx.currentTime = 0;
						wingSfx.play();
						bird.speedY = -4;
						dynamicThreshold = 1;
					}
					lastPercent = percent;
				}else{
					dynamicThreshold = threshold;
					lastPercent = 0;
				}
			}

			// Detecting ground
			let grounded = false;
			if(bird.y + birdSprite.height >= canvas.height - landImage.height){
				bird.y = canvas.height - landImage.height - birdSprite.height;
				ended = true;
				grounded = true;
			}

			// Drawing land
			ctx.fillStyle = landPattern;
			ctx.translate(-(distance % landImage.width), canvas.height - landImage.height);
			ctx.fillRect(0, 0, canvas.width + landImage.width, landImage.height);
			ctx.translate(distance % landImage.width, -(canvas.height - landImage.height));

			// Drawing the sky
			ctx.fillStyle = skyPattern;
			ctx.translate(0, canvas.height - landImage.height - skyImage.height);
			ctx.fillRect(0, 0, canvas.width + skyImage.width, skyImage.height);
			ctx.translate(0, -(canvas.height - landImage.height - skyImage.height));

			// Drawing pipes
			if(analyser && threshold){
				ctx.fillStyle = pipePattern;
				for(let i = 0; i < pipes.length;){
					const pipe = pipes[i];
					const visibleX = pipe.x - distance;
					if(visibleX <= -pipeImage.width){
						pipes.splice(pipes.indexOf(pipe), 1);
						continue;
					}
					if(
						!ended &&
						bird.x + birdSprite.width > visibleX &&
						visibleX + pipeImage.width > bird.x &&
						(bird.y < pipe.holeY || bird.y + birdSprite.height > pipe.holeY + pipe.holeH)
					){
						hitSfx.currentTime = 0;
						hitSfx.play();
						ended = true;
					}
					ctx.translate(visibleX, 0);
					ctx.fillRect(0, 0, pipeImage.width, pipe.holeY - pipeDownImage.height);
					ctx.fillRect(0, pipe.holeY + pipe.holeH + pipeUpImage.height, pipeImage.width, window.innerHeight - landImage.height - pipe.holeY - pipe.holeH - pipeUpImage.height);
					ctx.drawImage(pipeDownImage, 0, pipe.holeY - pipeDownImage.height);
					ctx.drawImage(pipeUpImage, 0, pipe.holeY + pipe.holeH);
					ctx.translate(-visibleX, 0);
					i++;
				}
			}

			// Drawing da bird
			const translateX = bird.x + birdImage.width / 2;
			const translateY = Math.floor(bird.y + (birdImage.height / 4) / 2);
			let rotation = Math.min(90 * Math.PI / 180,
				!ended
				? endRotation = bird.speedY / 8
				: grounded
				? endRotation
				: endRotation += 4 * Math.PI / 180
			);
			ctx.translate(translateX, translateY);
			ctx.rotate(rotation);
			birdSprite[Math.floor((counter % (birdSprite.length * 4)) / 4)](ctx, -birdImage.width / 2, -(birdImage.height / 4) / 2);
			ctx.rotate(-rotation);
			ctx.translate(-translateX, -translateY);

			// Drawing shout strength & threshold
			if(analyser && threshold){
				ctx.fillStyle = 'rgba(255, 0, 0, 0.5)';
				ctx.fillRect(0, canvas.height - 5, canvas.width * percent / threshold * 0.5, 5);
			}

			requestAnimationFrame(loop);
		})();
	});
	
	playGame().then(score => {
		console.log('Score: '+score);
	});
})();