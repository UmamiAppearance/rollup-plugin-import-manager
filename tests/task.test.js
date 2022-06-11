import {jest} from '@jest/globals';
import { createFilter } from 'rollup-pluginutils';
import stripCode from '../index'


const mockedFilter = jest.fn((id) => true)

jest.mock('rollup-pluginutils', () => {
  const originalModule = jest.requireActual('rollup-pluginutils');
  return {
    __esModule: true,
    ...originalModule,
    default: originalModule.default,
    createFilter: jest.fn(() => mockedFilter)
  };
})


describe('stripCode.', () => {

  test('should has proper name', () => {
    expect(stripCode().name).toBe('stripCode')
  })

  test('should return proper object', () => {
    expect(typeof stripCode()).toBe('object')
  })

  test('should mock createFilter', () => {
    const filterFn = createFilter()
    expect(typeof filterFn).toBe('function')
    expect(filterFn()).toBe(true)
  })

  describe('default settings.', () => {

    test('should remove code', () => {

      const obj = stripCode()

      const source = `whatever\n
      /* start_comment */ \n
      text to remove\n
      /* end_comment */`

      const result = obj.transform(source).code

      expect(result.trim()).toBe('whatever')
    })

    test('should not remove anything', () => {
      const obj = stripCode()

      const source = `whatever\n
      /* whatever_comment */ \n
      text to remove\n
      /* ends_comment */`

      const result = obj.transform(source).code

      expect(result.trim()).toBe(source)
    })

  })

  describe('override settings.', () => {

    test('should remove code with overrided options', () => {
      const obj = stripCode({
        start_comment: 'START.TESTS_ONLY',
        end_comment: 'END.TESTS_ONLY'
      })

      const source = `whatever\n
      /* START.TESTS_ONLY */ \n
      text to remove\n
      /* END.TESTS_ONLY */`

      const result = obj.transform(source).code

      expect(result.trim()).toBe('whatever')
    })

    test('should remove code with standart comments', () => {
      const obj = stripCode({
        start_comment: 'START.TESTS_ONLY',
        end_comment: 'END.TESTS_ONLY'
      })

      const source = `whatever\n
      /* start_comment */ \n
      text to remove\n
      /* end_comment */`

      const result = obj.transform(source).code

      expect(result.trim()).toBe(source)
    })

    test('should not remove anything', () => {
      const obj = stripCode({
        start_comment: 'START.TESTS_ONLY',
        end_comment: 'END.TESTS_ONLY'
      })

      const source = `whatever\n
      /* whatever_comment */ \n
      text to remove\n
      /* ends_comment */`

      const result = obj.transform(source).code

      expect(result.trim()).toBe(source)
    })

  })

})