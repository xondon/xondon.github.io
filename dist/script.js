<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Dominic Donatucci</title>
  </head>
  <body>
    <div id="app">
      <canvas id="c"></canvas>

      <!-- UI Overlay -->
      <div class="overlay">
        <div class="topbar">
          <div class="brand">DD</div>
          <nav class="nav">
            <a href="#home">Home</a>
            <a href="#resume">Resume</a>
            <a href="#projects">Projects</a>
            <a href="#about">About</a>
          </nav>
        </div>

        <div class="center">
          <div class="reveal">
            <div class="name">Dominic <span>Donatucci</span></div>
            <div class="company">Deity</div>
          </div>
        </div>

        <div class="scrollHint">
          <div class="mouse"></div>
          <div class="text">Scroll</div>
        </div>
      </div>

      <!-- This creates scroll distance without showing a long page -->
      <div class="scrollSpacer"></div>
    </div>

    <script type="module" src="/src/main.js"></script>
  </body>
</html>
