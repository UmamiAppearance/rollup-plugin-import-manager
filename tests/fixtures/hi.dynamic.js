const hi = await import("./lib/hello.js");
const dummy = await import("./lib/dummy.js");

const englishGreeting = () => hi.hello();
const nonEnglishGreeting = () => hi.hallo();
const nerdGreeting = () => hi.default();

const date = new Date();

if (date.getFullYear() === 1984) {
    console.log(
        englishGreeting(),
        nonEnglishGreeting(),
        nerdGreeting()
    );

    console.log(dummy);
}
