import test from 'node:test';import assert from 'node:assert/strict';
import {HOME_QUIZ,validateHomeAnswers,describeHomeProfile,homeQuizQuestion,loadHomeProfile} from '../web/home-quiz.js';
const answers={price:'250k-500k',beds:'3',baths:'2',sqft:'1500-2000'};
test('quiz covers price, beds, baths and square feet and rejects unknown answers',()=>{
 assert.deepEqual(HOME_QUIZ.map(question=>question.key),['price','beds','baths','sqft']);
 for(const question of HOME_QUIZ)assert.equal(question.options.length,5);
 assert.deepEqual(validateHomeAnswers(answers),answers);
 assert.equal(validateHomeAnswers({...answers,beds:'30'}),null);assert.equal(validateHomeAnswers({...answers,price:'<script>'}),null);assert.equal(validateHomeAnswers({}),null);assert.equal(validateHomeAnswers(null),null);
});
test('the Gemma question describes the home in plain words and stays within the server limit',()=>{
 const question=homeQuizQuestion(answers,'Boston, MA');
 for(const expected of [/between \$250k and \$500k/,/3 beds/,/2 baths/,/between 1,500 and 2,000 square feet/,/Boston, MA/,/recent local reporting/])assert.match(question,expected);
 assert.ok(question.length<1000);
 assert.equal(homeQuizQuestion({price:'bogus'},'Boston, MA'),'');
 assert.equal(describeHomeProfile({price:'over-1m',beds:'5+',baths:'3+',sqft:'over-3000'}),'a home priced over $1M with 5+ beds, 3+ baths and over 3,000 square feet');
 assert.equal(loadHomeProfile(),null);
});
